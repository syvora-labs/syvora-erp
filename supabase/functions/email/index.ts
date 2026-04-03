import { createClient } from "npm:@supabase/supabase-js@2";
import { ImapFlow } from "npm:imapflow@1";
import nodemailer from "npm:nodemailer@7";

// ── Types ────────────────────────────────────────────────────────────────────

interface Credentials {
  emailAddress: string;
  password: string;
  displayName: string | null;
  signatureHtml: string | null;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  useTls: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, apikey, x-client-info",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 500): Response {
  return json({ error: message }, status);
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function authenticate(
  req: Request,
): Promise<{ userId: string; mandatorId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return err("Missing authorization header", 401);
  }
  const supabase = getSupabaseAdmin();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(authHeader.slice(7));
  if (authErr || !user) return err("Invalid token", 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("mandator_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.mandator_id) return err("No mandator assigned", 403);

  const { data: mandator } = await supabase
    .from("mandators")
    .select("module_email")
    .eq("id", profile.mandator_id)
    .maybeSingle();
  if (!mandator?.module_email) return err("Email module not enabled", 403);

  return { userId: user.id, mandatorId: profile.mandator_id };
}

async function getCredentials(
  userId: string,
  mandatorId: string,
): Promise<Credentials | null> {
  const supabase = getSupabaseAdmin();
  const encryptionKey = Deno.env.get("EMAIL_ENCRYPTION_KEY")!;

  const { data: settings, error: settingsErr } = await supabase.rpc(
    "decrypt_email_password",
    { p_user_id: userId, p_key: encryptionKey },
  );
  if (settingsErr || !settings?.length) return null;

  const row = settings[0] as {
    email_address: string;
    decrypted_password: string;
    display_name: string | null;
    signature_html: string | null;
  };

  const { data: config } = await supabase
    .from("mandator_email_config")
    .select("*")
    .eq("mandator_id", mandatorId)
    .maybeSingle();
  if (!config) return null;

  return {
    emailAddress: row.email_address,
    password: row.decrypted_password,
    displayName: row.display_name,
    signatureHtml: row.signature_html,
    imapHost: config.imap_host,
    imapPort: config.imap_port,
    smtpHost: config.smtp_host,
    smtpPort: config.smtp_port,
    useTls: config.use_tls,
  };
}

async function withImap<T>(
  creds: Credentials,
  callback: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  console.time("imap-connect");
  const client = new ImapFlow({
    host: creds.imapHost,
    port: creds.imapPort,
    secure: creds.useTls,
    auth: { user: creds.emailAddress, pass: creds.password },
    logger: false,
  });
  await client.connect();
  console.timeEnd("imap-connect");
  try {
    return await callback(client);
  } finally {
    try { await client.logout(); } catch { /* */ }
  }
}

function createTransport(creds: Credentials) {
  return nodemailer.createTransport({
    host: creds.smtpHost,
    port: creds.smtpPort,
    secure: creds.useTls,
    auth: { user: creds.emailAddress, pass: creds.password },
  });
}

function fromAddress(creds: Credentials): string {
  return creds.displayName
    ? `"${creds.displayName}" <${creds.emailAddress}>`
    : creds.emailAddress;
}

const mapAddr = (a: any) => ({
  name: a.name,
  address: `${a.mailbox}@${a.host}`,
});

async function readStream(stream: any): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
  }
  if (chunks.length === 0) return new Uint8Array(0);
  if (chunks.length === 1) return chunks[0];
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return merged;
}

// ── IMAP operations (accept client, no connection overhead) ──────────────────

// Only fetch unread count for key folders to avoid N STATUS round trips
const KEY_FOLDERS = new Set(["INBOX", "Drafts", "Sent", "Junk", "Trash"]);

async function fetchFolderList(client: ImapFlow, fullStatus = false) {
  console.time("list-folders");
  const folders = await client.list();
  console.timeEnd("list-folders");

  console.time("folder-status");
  const result = [];
  for (const f of folders) {
    let unread = 0;
    // Only STATUS key folders (5 calls max instead of 20+)
    if (fullStatus || KEY_FOLDERS.has(f.name) || KEY_FOLDERS.has(f.path)) {
      try {
        const status = await client.status(f.path, { unseen: true });
        unread = status.unseen ?? 0;
      } catch { /* */ }
    }
    result.push({
      path: f.path,
      name: f.name,
      delimiter: f.delimiter,
      flags: Array.from(f.flags ?? []),
      specialUse: f.specialUse ?? null,
      unread,
    });
  }
  console.timeEnd("folder-status");
  return result;
}

async function fetchMessageList(
  client: ImapFlow,
  folder: string,
  page: number,
  limit: number,
) {
  const lock = await client.getMailboxLock(folder);
  try {
    const mailbox = client.mailbox as any;
    const total: number = mailbox?.exists ?? 0;
    if (total === 0) return { messages: [], total, page, limit };

    const start = Math.max(1, total - page * limit + 1);
    const end = Math.max(1, total - (page - 1) * limit);
    const messages: any[] = [];

    for await (const msg of client.fetch(`${start}:${end}`, {
      envelope: true,
      flags: true,
      uid: true,
      size: true,
      internalDate: true,
    })) {
      const env = msg.envelope as any;
      messages.push({
        uid: msg.uid,
        seq: msg.seq,
        flags: Array.from(msg.flags ?? []),
        size: msg.size,
        date: msg.internalDate,
        envelope: {
          subject: env?.subject ?? "",
          from: env?.from?.map(mapAddr) ?? [],
          to: env?.to?.map(mapAddr) ?? [],
          date: env?.date,
          messageId: env?.messageId,
          inReplyTo: env?.inReplyTo,
        },
      });
    }

    messages.reverse();
    return { messages, total, page, limit };
  } finally {
    lock.release();
  }
}

function walkBodyStructure(bodyStructure: any) {
  const textParts: { part: string; type: string }[] = [];
  const attachments: {
    part: string;
    filename: string;
    contentType: string;
    size: number;
  }[] = [];

  function walk(node: any, partPath = ""): void {
    if (!node) return;
    if (node.childNodes?.length) {
      for (let i = 0; i < node.childNodes.length; i++) {
        walk(node.childNodes[i], partPath ? `${partPath}.${i + 1}` : `${i + 1}`);
      }
      return;
    }
    const type = node.type ?? "";
    const disposition = (node.disposition ?? "").toLowerCase();
    const part = partPath || "1";

    if (disposition === "attachment" || (node.id && type.startsWith("image/"))) {
      attachments.push({
        part,
        filename:
          node.dispositionParameters?.filename ??
          node.parameters?.name ??
          "attachment",
        contentType: type,
        size: node.size ?? 0,
      });
    } else if (type === "text/html") {
      textParts.push({ part, type: "html" });
    } else if (type === "text/plain") {
      textParts.push({ part, type: "text" });
    }
  }
  walk(bodyStructure);
  return { textParts, attachments };
}

async function fetchMessageDetail(
  client: ImapFlow,
  uid: number,
  folder: string,
) {
  const lock = await client.getMailboxLock(folder);
  try {
    console.time("msg-fetch-structure");
    const msg = await client.fetchOne(
      uid.toString(),
      { uid: true, envelope: true, bodyStructure: true },
      { uid: true },
    );
    console.timeEnd("msg-fetch-structure");
    if (!msg) return null;

    const env = msg.envelope as any;
    const { textParts, attachments } = walkBodyStructure(msg.bodyStructure);
    console.log("Text parts:", textParts.length, "Attachments:", attachments.length);

    let html: string | null = null;
    let text = "";

    console.time("msg-download-text");
    for (const tp of textParts) {
      const dl = await client.download(uid.toString(), tp.part, { uid: true });
      if (dl?.content) {
        const body = new TextDecoder().decode(await readStream(dl.content));
        console.log(`Part ${tp.part} (${tp.type}): ${body.length} chars`);
        if (tp.type === "html") html = body;
        else text = body;
      }
    }
    console.timeEnd("msg-download-text");

    await client.messageFlagsAdd(uid.toString(), ["\\Seen"], { uid: true });

    return {
      uid,
      subject: env?.subject ?? "",
      from: env?.from?.map(mapAddr) ?? [],
      to: env?.to?.map(mapAddr) ?? [],
      cc: env?.cc?.map(mapAddr) ?? [],
      bcc: env?.bcc?.map(mapAddr) ?? [],
      date: env?.date?.toISOString?.() ?? env?.date ?? null,
      html,
      text,
      messageId: env?.messageId ?? null,
      inReplyTo: env?.inReplyTo ?? null,
      references: env?.references ?? [],
      attachments: attachments.map((a, i) => ({
        id: i,
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
        part: a.part,
      })),
    };
  } finally {
    lock.release();
  }
}

// ── Route handlers ───────────────────────────────────────────────────────────

// GET /init?folder=INBOX&page=1&limit=50
// Returns { folders, messages } in ONE imap connection
async function handleInit(creds: Credentials, url: URL): Promise<Response> {
  const folder = url.searchParams.get("folder") || "INBOX";
  const page = parseInt(url.searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "25"), 100);

  console.time("init-total");
  const result = await withImap(creds, async (client) => {
    console.time("init-folders");
    const folders = await fetchFolderList(client);
    console.timeEnd("init-folders");

    console.time("init-messages");
    const messageData = await fetchMessageList(client, folder, page, limit);
    console.timeEnd("init-messages");

    return { folders, ...messageData };
  });
  console.timeEnd("init-total");
  return json(result);
}

// POST /batch — execute multiple operations in one IMAP connection
// Body: { operations: [{ action, params }] }
// Supported actions: "folders", "messages", "messageDetail", "flags", "move", "delete"
async function handleBatch(creds: Credentials, body: any): Promise<Response> {
  const operations = body.operations as {
    action: string;
    params?: any;
  }[];
  if (!operations?.length) return err("No operations", 400);

  const results = await withImap(creds, async (client) => {
    const out: any[] = [];
    for (const op of operations) {
      try {
        switch (op.action) {
          case "folders":
            out.push({ action: "folders", data: await fetchFolderList(client) });
            break;
          case "messages": {
            const p = op.params ?? {};
            out.push({
              action: "messages",
              data: await fetchMessageList(
                client,
                p.folder || "INBOX",
                p.page || 1,
                Math.min(p.limit || 50, 100),
              ),
            });
            break;
          }
          case "messageDetail": {
            const p = op.params ?? {};
            const detail = await fetchMessageDetail(
              client,
              p.uid,
              p.folder || "INBOX",
            );
            out.push({ action: "messageDetail", data: detail });
            break;
          }
          case "flags": {
            const p = op.params ?? {};
            const lock = await client.getMailboxLock(p.folder || "INBOX");
            try {
              if (p.add?.length)
                await client.messageFlagsAdd(String(p.uid), p.add, { uid: true });
              if (p.remove?.length)
                await client.messageFlagsRemove(String(p.uid), p.remove, { uid: true });
            } finally {
              lock.release();
            }
            out.push({ action: "flags", data: { success: true } });
            break;
          }
          case "move": {
            const p = op.params ?? {};
            const lock = await client.getMailboxLock(p.from);
            try {
              await client.messageMove(String(p.uid), p.to, { uid: true });
            } finally {
              lock.release();
            }
            out.push({ action: "move", data: { success: true } });
            break;
          }
          case "delete": {
            const p = op.params ?? {};
            const folder = p.folder || "INBOX";
            const lock = await client.getMailboxLock(folder);
            try {
              if (p.permanent) {
                await client.messageFlagsAdd(String(p.uid), ["\\Deleted"], { uid: true });
                await client.messageDelete(String(p.uid), { uid: true });
              } else {
                await client.messageMove(String(p.uid), "Trash", { uid: true });
              }
            } finally {
              lock.release();
            }
            out.push({ action: "delete", data: { success: true } });
            break;
          }
          default:
            out.push({ action: op.action, error: "Unknown action" });
        }
      } catch (e: any) {
        out.push({ action: op.action, error: e.message });
      }
    }
    return out;
  });
  return json(results);
}

// ── Main router ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const creds = await getCredentials(auth.userId, auth.mandatorId);
  if (!creds) return err("Email not configured", 400);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/email/, "");

  try {
    // ── Batched endpoints (1 IMAP connection for multiple ops) ────────
    if (path === "/init" && req.method === "GET") {
      return handleInit(creds, url);
    }

    if (path === "/batch" && req.method === "POST") {
      const body = await req.json();
      return handleBatch(creds, body);
    }

    // ── Individual endpoints ─────────────────────────────────────────
    if (path === "/folders" && req.method === "GET") {
      const data = await withImap(creds, (c) => fetchFolderList(c));
      return json(data);
    }

    if (path === "/messages" && req.method === "GET") {
      const folder = url.searchParams.get("folder") || "INBOX";
      const page = parseInt(url.searchParams.get("page") ?? "1");
      const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 100);
      const data = await withImap(creds, (c) => fetchMessageList(c, folder, page, limit));
      return json(data);
    }

    const msgMatch = path.match(/^\/messages\/(\d+)$/);
    if (msgMatch) {
      const uid = parseInt(msgMatch[1]);
      if (req.method === "GET") {
        const folder = url.searchParams.get("folder") || "INBOX";
        const data = await withImap(creds, (c) => fetchMessageDetail(c, uid, folder));
        if (!data) return err("Message not found", 404);
        return json(data);
      }
      if (req.method === "DELETE") {
        const body = await req.json().catch(() => ({}));
        const folder = body?.folder || "INBOX";
        await withImap(creds, async (client) => {
          const lock = await client.getMailboxLock(folder);
          try {
            if (body?.permanent) {
              await client.messageFlagsAdd(uid.toString(), ["\\Deleted"], { uid: true });
              await client.messageDelete(uid.toString(), { uid: true });
            } else {
              await client.messageMove(uid.toString(), "Trash", { uid: true });
            }
          } finally { lock.release(); }
        });
        return json({ success: true });
      }
    }

    const attMatch = path.match(/^\/messages\/(\d+)\/attachments\/(\d+)$/);
    if (attMatch && req.method === "GET") {
      const uid = parseInt(attMatch[1]);
      const folder = url.searchParams.get("folder") || "INBOX";
      const part = url.searchParams.get("part") || "2";
      const filename = url.searchParams.get("filename") || "download";
      const contentType = url.searchParams.get("contentType") || "application/octet-stream";
      const data = await withImap(creds, async (client) => {
        const lock = await client.getMailboxLock(folder);
        try {
          const dl = await client.download(uid.toString(), part, { uid: true });
          if (!dl?.content) return null;
          return await readStream(dl.content);
        } finally { lock.release(); }
      });
      if (!data) return err("Attachment not found", 404);
      return new Response(data, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    const moveMatch = path.match(/^\/messages\/(\d+)\/move$/);
    if (moveMatch && req.method === "PUT") {
      const uid = parseInt(moveMatch[1]);
      const body = await req.json();
      await withImap(creds, async (client) => {
        const lock = await client.getMailboxLock(body.from);
        try { await client.messageMove(uid.toString(), body.to, { uid: true }); }
        finally { lock.release(); }
      });
      return json({ success: true });
    }

    const flagsMatch = path.match(/^\/messages\/(\d+)\/flags$/);
    if (flagsMatch && req.method === "PUT") {
      const uid = parseInt(flagsMatch[1]);
      const body = await req.json();
      await withImap(creds, async (client) => {
        const lock = await client.getMailboxLock(body.folder || "INBOX");
        try {
          if (body.add?.length) await client.messageFlagsAdd(uid.toString(), body.add, { uid: true });
          if (body.remove?.length) await client.messageFlagsRemove(uid.toString(), body.remove, { uid: true });
        } finally { lock.release(); }
      });
      return json({ success: true });
    }

    if (path === "/send" && req.method === "POST") {
      const body = await req.json();
      const transport = createTransport(creds);
      const result = await transport.sendMail({
        from: fromAddress(creds),
        to: body.to, cc: body.cc, bcc: body.bcc,
        subject: body.subject, html: body.html, text: body.text,
        attachments: body.attachments?.map((a: any) => ({
          filename: a.filename,
          content: Buffer.from(a.content, "base64"),
          contentType: a.contentType,
        })),
      });
      return json({ messageId: result.messageId });
    }

    if (path === "/reply" && req.method === "POST") {
      const body = await req.json();
      const transport = createTransport(creds);
      const result = await transport.sendMail({
        from: fromAddress(creds),
        to: body.to, cc: body.cc, bcc: body.bcc,
        subject: body.subject, html: body.html, text: body.text,
        inReplyTo: body.inReplyTo,
        references: Array.isArray(body.references) ? body.references.join(" ") : body.references,
        attachments: body.attachments?.map((a: any) => ({
          filename: a.filename,
          content: Buffer.from(a.content, "base64"),
          contentType: a.contentType,
        })),
      });
      return json({ messageId: result.messageId });
    }

    if (path === "/forward" && req.method === "POST") {
      const body = await req.json();
      const transport = createTransport(creds);
      const result = await transport.sendMail({
        from: fromAddress(creds),
        to: body.to, cc: body.cc, bcc: body.bcc,
        subject: body.subject, html: body.html, text: body.text,
        attachments: body.attachments?.map((a: any) => ({
          filename: a.filename,
          content: Buffer.from(a.content, "base64"),
          contentType: a.contentType,
        })),
      });
      return json({ messageId: result.messageId });
    }

    if (path === "/drafts" && req.method === "POST") {
      const body = await req.json();
      await withImap(creds, async (client) => {
        const raw = [
          `From: ${fromAddress(creds)}`,
          `To: ${body.to ?? ""}`,
          body.cc ? `Cc: ${body.cc}` : null,
          body.bcc ? `Bcc: ${body.bcc}` : null,
          `Subject: ${body.subject ?? ""}`,
          "MIME-Version: 1.0",
          "Content-Type: text/html; charset=utf-8",
          "",
          body.html || body.text || "",
        ].filter(Boolean).join("\r\n");
        await client.append("Drafts", Buffer.from(raw), ["\\Draft", "\\Seen"]);
      });
      return json({ success: true });
    }

    if (path === "/contacts" && req.method === "GET") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const addresses = await withImap(creds, async (client) => {
        const result = new Set<string>();
        try {
          const lock = await client.getMailboxLock("Sent");
          try {
            const mb = client.mailbox as any;
            const total: number = mb?.exists ?? 0;
            if (total > 0) {
              const start = Math.max(1, total - 200);
              for await (const msg of client.fetch(`${start}:${total}`, { envelope: true, uid: true })) {
                for (const addr of (msg.envelope as any)?.to ?? []) {
                  if (addr.mailbox && addr.host) {
                    result.add(addr.name ? `${addr.name} <${addr.mailbox}@${addr.host}>` : `${addr.mailbox}@${addr.host}`);
                  }
                }
              }
            }
          } finally { lock.release(); }
        } catch { /* */ }
        return result;
      });
      return json(Array.from(addresses).filter((a) => a.toLowerCase().includes(q)).slice(0, 10));
    }

    return err("Not found", 404);
  } catch (e: any) {
    console.error("Edge function error:", e);
    return err(e.message, 500);
  }
});
