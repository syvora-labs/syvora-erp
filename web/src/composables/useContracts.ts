import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useMandator } from './useMandator'

export interface ContractTemplate {
    id: string
    mandator_id: string
    name: string
    body: string
    jurisdiction_canton: string
    governing_law: string
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
}

export interface Contract {
    id: string
    mandator_id: string
    template_id: string | null
    artist_id: string
    release_id: string | null
    title: string
    body_snapshot: string
    status: 'draft' | 'open' | 'partially_signed' | 'fully_signed' | 'voided'
    public_token: string
    effective_date: string | null
    territory: string | null
    term: string | null
    exclusivity: string | null
    royalty_rate: string | null
    advance: string | null
    concluded_at: string | null
    voided_at: string | null
    voided_by: string | null
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
    creator_name: string | null
    updater_name: string | null
    artist_name: string | null
    release_title: string | null
    signatory_count: number
    signature_count: number
}

export interface ContractSignatory {
    id: string
    contract_id: string
    role: string
    display_name: string
    legal_name: string
    address: string
    date_of_birth: string | null
    email: string | null
    user_id: string | null
    signing_order: number
    created_at: string
}

export interface ContractSignature {
    id: string
    contract_id: string
    signatory_id: string
    signature_svg: string
    signed_at: string
    ip_address: string | null
    user_agent: string | null
}

const contracts = ref<Contract[]>([])
const templates = ref<ContractTemplate[]>([])
const loading = ref(false)

export function useContracts() {
    const { mandator } = useMandator()

    // ── Profile enrichment helper ─────────────────────────────────────────────

    async function buildProfileMap(userIds: string[]): Promise<Record<string, string | null>> {
        if (!userIds.length) return {}
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name')
            .in('id', userIds)
        return Object.fromEntries((profiles ?? []).map(p => [p.id, p.display_name]))
    }

    // ── Template CRUD ─────────────────────────────────────────────────────────

    async function fetchTemplates() {
        loading.value = true
        const { data, error } = await supabase
            .from('contract_templates')
            .select('*')
            .eq('mandator_id', mandator.value?.id)
            .order('name')
        if (error) throw error

        const raw = (data ?? []) as Omit<ContractTemplate, 'creator_name' | 'updater_name'>[]

        const userIds = [...new Set(
            raw.flatMap(r => [r.created_by, r.updated_by]).filter((id): id is string => !!id)
        )]
        const profileMap = await buildProfileMap(userIds)

        templates.value = raw.map(r => ({
            ...r,
            creator_name: r.created_by ? (profileMap[r.created_by] ?? null) : null,
            updater_name: r.updated_by ? (profileMap[r.updated_by] ?? null) : null,
        }))
        loading.value = false
    }

    async function createTemplate(form: {
        name: string
        body: string
        jurisdiction_canton: string
    }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('contract_templates')
            .insert({ ...form, created_by: user?.id, mandator_id: mandator.value?.id })
        if (error) throw error
        await fetchTemplates()
    }

    async function updateTemplate(id: string, form: {
        name?: string
        body?: string
        jurisdiction_canton?: string
    }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('contract_templates')
            .update({ ...form, updated_by: user?.id })
            .eq('id', id)
        if (error) throw error
        await fetchTemplates()
    }

    async function deleteTemplate(id: string) {
        const { error } = await supabase
            .from('contract_templates')
            .delete()
            .eq('id', id)
        if (error) throw error
        await fetchTemplates()
    }

    // ── Contracts helpers ─────────────────────────────────────────────────────

    async function enrichContracts(raw: any[]): Promise<Contract[]> {
        if (!raw.length) return []

        // Fetch signatory and signature counts in bulk
        const contractIds = raw.map(c => c.id)
        const [{ data: signatories }, { data: signatures }] = await Promise.all([
            supabase
                .from('contract_signatories')
                .select('contract_id')
                .in('contract_id', contractIds),
            supabase
                .from('contract_signatures')
                .select('contract_id')
                .in('contract_id', contractIds),
        ])

        const signatoryCountMap: Record<string, number> = {}
        const signatureCountMap: Record<string, number> = {}
        for (const s of signatories ?? []) {
            signatoryCountMap[s.contract_id] = (signatoryCountMap[s.contract_id] ?? 0) + 1
        }
        for (const s of signatures ?? []) {
            signatureCountMap[s.contract_id] = (signatureCountMap[s.contract_id] ?? 0) + 1
        }

        // Profile enrichment
        const userIds = [...new Set(
            raw.flatMap(r => [r.created_by, r.updated_by]).filter((id): id is string => !!id)
        )]
        const profileMap = await buildProfileMap(userIds)

        return raw.map(r => ({
            ...r,
            artist_name: r.artists?.name ?? null,
            release_title: r.releases?.title ?? null,
            creator_name: r.created_by ? (profileMap[r.created_by] ?? null) : null,
            updater_name: r.updated_by ? (profileMap[r.updated_by] ?? null) : null,
            signatory_count: signatoryCountMap[r.id] ?? 0,
            signature_count: signatureCountMap[r.id] ?? 0,
        }))
    }

    // ── Contracts CRUD ────────────────────────────────────────────────────────

    async function fetchContracts() {
        loading.value = true
        const { data, error } = await supabase
            .from('contracts')
            .select('*, artists(name), releases(title)')
            .eq('mandator_id', mandator.value?.id)
            .order('created_at', { ascending: false })
        if (error) throw error

        contracts.value = await enrichContracts(data ?? [])
        loading.value = false
    }

    async function fetchContractsByArtist(artistId: string): Promise<Contract[]> {
        const { data, error } = await supabase
            .from('contracts')
            .select('*, artists(name), releases(title)')
            .eq('mandator_id', mandator.value?.id)
            .eq('artist_id', artistId)
            .order('created_at', { ascending: false })
        if (error) throw error
        return enrichContracts(data ?? [])
    }

    async function fetchContractsByRelease(releaseId: string): Promise<Contract[]> {
        const { data, error } = await supabase
            .from('contracts')
            .select('*, artists(name), releases(title)')
            .eq('mandator_id', mandator.value?.id)
            .eq('release_id', releaseId)
            .order('created_at', { ascending: false })
        if (error) throw error
        return enrichContracts(data ?? [])
    }

    async function createContract(form: {
        template_id?: string | null
        artist_id: string
        release_id?: string | null
        title: string
        body_snapshot?: string
        effective_date?: string | null
        territory?: string | null
        term?: string | null
        exclusivity?: string | null
        royalty_rate?: string | null
        advance?: string | null
        signatories: Array<{
            role: string
            display_name: string
            legal_name: string
            address: string
            date_of_birth?: string | null
            email?: string | null
            user_id?: string | null
            signing_order: number
        }>
    }) {
        const { data: { user } } = await supabase.auth.getUser()
        const { signatories, ...contractFields } = form

        const { data: contractData, error: contractError } = await supabase
            .from('contracts')
            .insert({
                ...contractFields,
                status: 'draft',
                created_by: user?.id,
                mandator_id: mandator.value?.id,
            })
            .select()
            .single()
        if (contractError) throw contractError

        if (signatories.length) {
            const signatoryRows = signatories.map(s => ({
                ...s,
                contract_id: contractData.id,
            }))
            const { error: sigError } = await supabase
                .from('contract_signatories')
                .insert(signatoryRows)
            if (sigError) throw sigError
        }

        await fetchContracts()
        return contractData
    }

    async function openContract(id: string) {
        const { data: { user } } = await supabase.auth.getUser()

        // 1. Fetch contract with template
        const { data: contract, error: contractError } = await supabase
            .from('contracts')
            .select('*, contract_templates(body, jurisdiction_canton, governing_law)')
            .eq('id', id)
            .single()
        if (contractError) throw contractError

        // 2. Verify status is draft
        if (contract.status !== 'draft') {
            throw new Error(`Contract is not in draft status (current: ${contract.status})`)
        }

        // 3. Fetch artist signatory (role='artist')
        const { data: artistSignatory } = await supabase
            .from('contract_signatories')
            .select('*')
            .eq('contract_id', id)
            .eq('role', 'artist')
            .maybeSingle()

        // 4. Fetch release if present
        let release: { title: string; type: string } | null = null
        if (contract.release_id) {
            const { data: releaseData } = await supabase
                .from('releases')
                .select('title, type')
                .eq('id', contract.release_id)
                .maybeSingle()
            release = releaseData
        }

        // 5. Fetch mandator
        const { data: mandatorData } = await supabase
            .from('mandators')
            .select('name, label_address, label_uid')
            .eq('id', mandator.value?.id)
            .maybeSingle()

        // 6. Build replacements map
        const template = contract.contract_templates as {
            body: string
            jurisdiction_canton: string
            governing_law: string
        } | null

        const replacements: Record<string, string> = {
            '{{label_name}}': mandatorData?.name ?? '',
            '{{label_address}}': mandatorData?.label_address ?? '',
            '{{label_uid}}': mandatorData?.label_uid ?? '',
            '{{artist_name}}': artistSignatory?.legal_name ?? '',
            '{{artist_address}}': artistSignatory?.address ?? '',
            '{{artist_dob}}': artistSignatory?.date_of_birth ?? '',
            '{{contract_date}}': '[Date of final signature]',
            '{{effective_date}}': contract.effective_date ?? '',
            '{{territory}}': contract.territory ?? '',
            '{{term}}': contract.term ?? '',
            '{{exclusivity}}': contract.exclusivity ?? '',
            '{{royalty_rate}}': contract.royalty_rate ?? '',
            '{{advance}}': contract.advance ?? '',
            '{{release_title}}': release?.title ?? '',
            '{{release_type}}': release?.type ?? '',
            '{{jurisdiction_canton}}': template?.jurisdiction_canton ?? '',
            '{{governing_law}}': template?.governing_law ?? '',
        }

        // 7. Resolve source body
        let resolved: string = template?.body ?? contract.body_snapshot ?? ''

        // 8. Replace all placeholders
        for (const [key, val] of Object.entries(replacements)) {
            resolved = resolved.replaceAll(key, val)
        }

        // 9. Update contract
        const { error: updateError } = await supabase
            .from('contracts')
            .update({ body_snapshot: resolved, status: 'open', updated_by: user?.id })
            .eq('id', id)
        if (updateError) throw updateError

        // 10. Re-fetch contracts
        await fetchContracts()
    }

    async function voidContract(id: string) {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
            .from('contracts')
            .update({
                status: 'voided',
                voided_at: new Date().toISOString(),
                voided_by: user?.id,
                updated_by: user?.id,
            })
            .eq('id', id)
        if (error) throw error
        await fetchContracts()
    }

    function getSigningUrl(contract: Contract): string {
        return `/sign/${contract.public_token}`
    }

    async function fetchContractSignatories(contractId: string): Promise<ContractSignatory[]> {
        const { data, error } = await supabase
            .from('contract_signatories')
            .select('*')
            .eq('contract_id', contractId)
            .order('signing_order')
        if (error) throw error
        return (data ?? []) as ContractSignatory[]
    }

    async function fetchContractSignatures(contractId: string): Promise<ContractSignature[]> {
        const { data, error } = await supabase
            .from('contract_signatures')
            .select('*')
            .eq('contract_id', contractId)
            .order('signed_at')
        if (error) throw error
        return (data ?? []) as ContractSignature[]
    }

    return {
        contracts,
        templates,
        loading,
        // Templates
        fetchTemplates,
        createTemplate,
        updateTemplate,
        deleteTemplate,
        // Contracts
        fetchContracts,
        fetchContractsByArtist,
        fetchContractsByRelease,
        createContract,
        openContract,
        voidContract,
        getSigningUrl,
        fetchContractSignatories,
        fetchContractSignatures,
    }
}
