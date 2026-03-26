import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const token = url.searchParams.get('token')

      if (!token) {
        return json({ error: 'Missing token parameter' }, 400)
      }

      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .select(
          'id, title, body_snapshot, status, public_token, effective_date, territory, term, exclusivity, royalty_rate, advance, concluded_at, mandator_id',
        )
        .eq('public_token', token)
        .single()

      if (contractError || !contract) {
        return json({ error: 'Contract not found' }, 404)
      }

      if (contract.status === 'draft' || contract.status === 'voided') {
        return json({ error: 'Contract not found' }, 404)
      }

      const { data: mandator, error: mandatorError } = await supabase
        .from('mandators')
        .select('name, contract_logo_url')
        .eq('id', contract.mandator_id)
        .single()

      if (mandatorError) {
        return json({ error: 'Failed to fetch mandator' }, 500)
      }

      const { data: signatories, error: signatoriesError } = await supabase
        .from('contract_signatories')
        .select('id, role, display_name, legal_name, signing_order')
        .eq('contract_id', contract.id)
        .order('signing_order', { ascending: true })

      if (signatoriesError) {
        return json({ error: 'Failed to fetch signatories' }, 500)
      }

      const { data: signatures, error: signaturesError } = await supabase
        .from('contract_signatures')
        .select('id, signatory_id, signature_svg, signed_at')
        .eq('contract_id', contract.id)

      if (signaturesError) {
        return json({ error: 'Failed to fetch signatures' }, 500)
      }

      return json({
        contract,
        mandator,
        signatories: signatories ?? [],
        signatures: signatures ?? [],
      })
    }

    if (req.method === 'POST') {
      const body = await req.json()
      const { token, signatory_id, signature_svg } = body

      if (!token || !signatory_id || !signature_svg) {
        return json({ error: 'Missing required fields: token, signatory_id, signature_svg' }, 400)
      }

      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .select('id, status, concluded_at')
        .eq('public_token', token)
        .single()

      if (contractError || !contract) {
        return json({ error: 'Contract not found' }, 404)
      }

      if (contract.status !== 'open' && contract.status !== 'partially_signed') {
        return json({ error: 'Contract is not open for signing' }, 400)
      }

      const { data: signatory, error: signatoryError } = await supabase
        .from('contract_signatories')
        .select('id, signing_order')
        .eq('id', signatory_id)
        .eq('contract_id', contract.id)
        .single()

      if (signatoryError || !signatory) {
        return json({ error: 'Signatory not found for this contract' }, 404)
      }

      const { data: existingSignature, error: existingSignatureError } = await supabase
        .from('contract_signatures')
        .select('id')
        .eq('contract_id', contract.id)
        .eq('signatory_id', signatory_id)
        .maybeSingle()

      if (existingSignatureError) {
        return json({ error: 'Failed to check existing signature' }, 500)
      }

      if (existingSignature) {
        return json({ error: 'Signatory has already signed this contract' }, 400)
      }

      const { data: priorSignatories, error: priorSignatoriesError } = await supabase
        .from('contract_signatories')
        .select('id')
        .eq('contract_id', contract.id)
        .lt('signing_order', signatory.signing_order)

      if (priorSignatoriesError) {
        return json({ error: 'Failed to fetch prior signatories' }, 500)
      }

      if (priorSignatories && priorSignatories.length > 0) {
        const priorIds = priorSignatories.map((s) => s.id)

        const { data: priorSignatures, error: priorSigsError } = await supabase
          .from('contract_signatures')
          .select('signatory_id')
          .eq('contract_id', contract.id)
          .in('signatory_id', priorIds)

        if (priorSigsError) {
          return json({ error: 'Failed to verify signing order' }, 500)
        }

        const signedIds = new Set((priorSignatures ?? []).map((s) => s.signatory_id))
        const allPriorSigned = priorIds.every((id) => signedIds.has(id))

        if (!allPriorSigned) {
          return json({ error: 'Previous signatories must sign first' }, 400)
        }
      }

      const ipAddress =
        req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null
      const userAgent = req.headers.get('user-agent') ?? null

      const { error: insertError } = await supabase.from('contract_signatures').insert({
        contract_id: contract.id,
        signatory_id,
        signature_svg,
        ip_address: ipAddress,
        user_agent: userAgent,
      })

      if (insertError) {
        return json({ error: 'Failed to save signature' }, 500)
      }

      const { data: updatedContract, error: refetchError } = await supabase
        .from('contracts')
        .select('status, concluded_at')
        .eq('id', contract.id)
        .single()

      if (refetchError || !updatedContract) {
        return json({ error: 'Failed to retrieve updated contract status' }, 500)
      }

      return json({
        success: true,
        status: updatedContract.status,
        concluded_at: updatedContract.concluded_at,
      })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    console.error('Unexpected error in sign-contract:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
