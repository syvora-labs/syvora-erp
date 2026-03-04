<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import {
    SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraEmptyState, SyvoraTabs
} from '@syvora/ui'
import { Bar, Doughnut } from 'vue-chartjs'
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, BarElement, ArcElement,
    Tooltip, Legend,
} from 'chart.js'
import { useFinancialCategories, type FinancialCategory } from '../composables/useFinancialCategories'
import { useFinancialTransactions, type FinancialTransaction } from '../composables/useFinancialTransactions'
import { useFinancialDashboard, type DashboardPeriod } from '../composables/useFinancialDashboard'
import { useEvents } from '../composables/useEvents'
import { supabase } from '../lib/supabase'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const { categories, loading: catLoading, fetchCategories, createCategory, updateCategory, deleteCategory } = useFinancialCategories()
const { transactions, loading: txLoading, fetchTransactions, createTransaction, updateTransaction, deleteTransaction } = useFinancialTransactions()
const { events, fetchEvents } = useEvents()
const {
    period, totalIncome, totalExpenses, netBalance,
    monthlyChartData, categoryChartData, recentTransactions,
} = useFinancialDashboard(transactions)

const releases = ref<{ id: string; title: string }[]>([])

async function fetchReleases() {
    const { data } = await supabase.from('releases').select('id, title').order('title')
    releases.value = data ?? []
}

const activeTab = ref('dashboard')

const chf = (v: number) => new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(v)

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('de-CH', { year: 'numeric', month: 'short', day: 'numeric' })
}

onMounted(async () => {
    await Promise.all([fetchCategories(), fetchTransactions(), fetchEvents(), fetchReleases()])
})

// ── Transaction Modal ──
const showTxModal = ref(false)
const editingTx = ref<FinancialTransaction | null>(null)
const savingTx = ref(false)
const txError = ref('')
const txFilter = ref<'all' | 'income' | 'expense'>('all')

const txForm = ref({
    type: 'expense' as string,
    amount: '',
    description: '',
    category_id: '',
    transaction_date: '',
    event_id: '',
    release_id: '',
})

const newCatName = ref('')
const newCatColor = ref('#73c3fe')
const isNewCategory = computed(() => txForm.value.category_id === '__new__')

const filteredTx = computed(() => {
    if (txFilter.value === 'all') return transactions.value
    return transactions.value.filter(t => t.type === txFilter.value)
})

const categoriesForType = computed(() => {
    const t = txForm.value.type
    return categories.value.filter(c => c.type === t || c.type === 'both')
})

function openCreateTx() {
    editingTx.value = null
    txForm.value = { type: 'expense', amount: '', description: '', category_id: '', transaction_date: '', event_id: '', release_id: '' }
    newCatName.value = ''
    newCatColor.value = '#73c3fe'
    txError.value = ''
    showTxModal.value = true
}

function openEditTx(tx: FinancialTransaction) {
    editingTx.value = tx
    txForm.value = {
        type: tx.type,
        amount: String(tx.amount),
        description: tx.description,
        category_id: tx.category_id ?? '',
        transaction_date: tx.transaction_date,
        event_id: tx.event_id ?? '',
        release_id: tx.release_id ?? '',
    }
    newCatName.value = ''
    newCatColor.value = '#73c3fe'
    txError.value = ''
    showTxModal.value = true
}

async function saveTx() {
    const amt = parseFloat(txForm.value.amount)
    if (!amt || amt <= 0) { txError.value = 'Amount must be greater than 0.'; return }
    if (!txForm.value.description.trim()) { txError.value = 'Description is required.'; return }
    if (!txForm.value.transaction_date) { txError.value = 'Date is required.'; return }

    if (isNewCategory.value && !newCatName.value.trim()) { txError.value = 'New category name is required.'; return }

    savingTx.value = true
    txError.value = ''
    try {
        let categoryId: string | null = txForm.value.category_id || null

        if (isNewCategory.value) {
            const catType = txForm.value.type === 'income' ? 'income' : txForm.value.type === 'expense' ? 'expense' : 'both'
            const newCat = await createCategory({ name: newCatName.value.trim(), type: catType, color: newCatColor.value })
            categoryId = newCat.id
        }

        const payload = {
            type: txForm.value.type,
            amount: amt,
            description: txForm.value.description.trim(),
            category_id: categoryId,
            event_id: txForm.value.event_id || null,
            release_id: txForm.value.release_id || null,
            transaction_date: txForm.value.transaction_date,
        }
        if (editingTx.value) {
            await updateTransaction(editingTx.value.id, payload)
        } else {
            await createTransaction(payload)
        }
        showTxModal.value = false
    } catch (e: any) {
        txError.value = e.message ?? 'Failed to save.'
    } finally {
        savingTx.value = false
    }
}

async function handleDeleteTx(tx: FinancialTransaction) {
    if (!confirm(`Delete transaction "${tx.description}"?`)) return
    try { await deleteTransaction(tx.id) } catch (e: any) { alert(e.message ?? 'Failed to delete.') }
}

// ── Category Modal ──
const showCatModal = ref(false)
const editingCat = ref<FinancialCategory | null>(null)
const savingCat = ref(false)
const catError = ref('')

const catForm = ref({
    name: '',
    type: 'expense' as string,
    color: '#73c3fe',
})

function openCreateCat() {
    editingCat.value = null
    catForm.value = { name: '', type: 'expense', color: '#73c3fe' }
    catError.value = ''
    showCatModal.value = true
}

function openEditCat(cat: FinancialCategory) {
    editingCat.value = cat
    catForm.value = { name: cat.name, type: cat.type, color: cat.color }
    catError.value = ''
    showCatModal.value = true
}

async function saveCat() {
    if (!catForm.value.name.trim()) { catError.value = 'Name is required.'; return }
    savingCat.value = true
    catError.value = ''
    try {
        if (editingCat.value) {
            await updateCategory(editingCat.value.id, catForm.value)
        } else {
            await createCategory(catForm.value)
        }
        showCatModal.value = false
    } catch (e: any) {
        catError.value = e.message ?? 'Failed to save.'
    } finally {
        savingCat.value = false
    }
}

async function handleDeleteCat(cat: FinancialCategory) {
    if (!confirm(`Delete category "${cat.name}"? Transactions will keep their data but lose this category link.`)) return
    try { await deleteCategory(cat.id) } catch (e: any) { alert(e.message ?? 'Failed to delete.') }
}

// ── Chart configs ──
const barChartData = computed(() => ({
    labels: monthlyChartData.value.labels,
    datasets: [
        { label: 'Income', data: monthlyChartData.value.income, backgroundColor: '#22c55e' },
        { label: 'Expenses', data: monthlyChartData.value.expenses, backgroundColor: '#ef4444' },
    ],
}))

const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#94a3b8' } } },
    scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } },
    },
}

const doughnutChartData = computed(() => ({
    labels: categoryChartData.value.labels,
    datasets: [{
        data: categoryChartData.value.amounts,
        backgroundColor: categoryChartData.value.colors,
        borderWidth: 0,
    }],
}))

const doughnutChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' as const, labels: { color: '#94a3b8' } } },
}

const periods: { key: DashboardPeriod; label: string }[] = [
    { key: 'month', label: 'Month' },
    { key: 'quarter', label: 'Quarter' },
    { key: 'year', label: 'Year' },
    { key: 'all', label: 'All' },
]
</script>

<template>
    <div class="page">
        <div class="page-header">
            <div>
                <h1 class="page-title">Financials</h1>
                <p class="page-subtitle">Track label income and expenses</p>
            </div>
        </div>

        <SyvoraTabs v-model="activeTab" :tabs="[
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'transactions', label: 'Transactions', count: transactions.length },
            { key: 'categories', label: 'Categories', count: categories.length },
        ]" />

        <!-- ═══ Dashboard ═══ -->
        <div v-if="activeTab === 'dashboard'">
            <div class="period-bar">
                <button
                    v-for="p in periods" :key="p.key"
                    class="period-btn" :class="{ 'period-btn--active': period === p.key }"
                    @click="period = p.key"
                >{{ p.label }}</button>
            </div>

            <div class="summary-cards">
                <div class="summary-card summary-card--income">
                    <span class="summary-label">Total Income</span>
                    <span class="summary-value">{{ chf(totalIncome) }}</span>
                </div>
                <div class="summary-card summary-card--expense">
                    <span class="summary-label">Total Expenses</span>
                    <span class="summary-value">{{ chf(totalExpenses) }}</span>
                </div>
                <div class="summary-card" :class="netBalance >= 0 ? 'summary-card--positive' : 'summary-card--negative'">
                    <span class="summary-label">Net Balance</span>
                    <span class="summary-value">{{ chf(netBalance) }}</span>
                </div>
            </div>

            <div class="charts-row">
                <div class="chart-box">
                    <h3 class="chart-title">Monthly Income vs Expenses</h3>
                    <div class="chart-wrapper">
                        <Bar v-if="monthlyChartData.labels.length" :data="barChartData" :options="barChartOptions" />
                        <p v-else class="chart-empty">No data for this period</p>
                    </div>
                </div>
                <div class="chart-box">
                    <h3 class="chart-title">Expenses by Category</h3>
                    <div class="chart-wrapper">
                        <Doughnut v-if="categoryChartData.labels.length" :data="doughnutChartData" :options="doughnutChartOptions" />
                        <p v-else class="chart-empty">No expense data</p>
                    </div>
                </div>
            </div>

            <div class="recent-section">
                <h3 class="section-title">Recent Transactions</h3>
                <div v-if="recentTransactions.length === 0" class="chart-empty">No transactions yet</div>
                <div v-else class="tx-list">
                    <div v-for="tx in recentTransactions" :key="tx.id" class="tx-row">
                        <span class="tx-type-badge" :class="'tx-type--' + tx.type">{{ tx.type }}</span>
                        <span class="tx-desc">{{ tx.description }}</span>
                        <span v-if="tx.category_name" class="tx-cat" :style="{ borderColor: tx.category_color ?? undefined }">{{ tx.category_name }}</span>
                        <span class="tx-date">{{ formatDate(tx.transaction_date) }}</span>
                        <span class="tx-amount" :class="'tx-amount--' + tx.type">{{ tx.type === 'expense' ? '-' : '+' }}{{ chf(tx.amount) }}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- ═══ Transactions ═══ -->
        <div v-if="activeTab === 'transactions'">
            <div class="tab-header">
                <div class="filter-bar">
                    <button class="filter-btn" :class="{ 'filter-btn--active': txFilter === 'all' }" @click="txFilter = 'all'">All</button>
                    <button class="filter-btn" :class="{ 'filter-btn--active': txFilter === 'income' }" @click="txFilter = 'income'">Income</button>
                    <button class="filter-btn" :class="{ 'filter-btn--active': txFilter === 'expense' }" @click="txFilter = 'expense'">Expenses</button>
                </div>
                <SyvoraButton @click="openCreateTx">+ New Transaction</SyvoraButton>
            </div>

            <div v-if="txLoading" class="loading-text">Loading…</div>
            <SyvoraEmptyState v-else-if="filteredTx.length === 0" title="No transactions" description="Add your first transaction to start tracking." />
            <div v-else class="tx-list">
                <div v-for="tx in filteredTx" :key="tx.id" class="tx-row tx-row--interactive">
                    <span class="tx-type-badge" :class="'tx-type--' + tx.type">{{ tx.type }}</span>
                    <span class="tx-desc">{{ tx.description }}</span>
                    <span v-if="tx.category_name" class="tx-cat" :style="{ borderColor: tx.category_color ?? undefined }">{{ tx.category_name }}</span>
                    <span class="tx-date">{{ formatDate(tx.transaction_date) }}</span>
                    <span v-if="tx.event_title" class="tx-link">Event: {{ tx.event_title }}</span>
                    <span v-if="tx.release_title" class="tx-link">Release: {{ tx.release_title }}</span>
                    <span class="tx-amount" :class="'tx-amount--' + tx.type">{{ tx.type === 'expense' ? '-' : '+' }}{{ chf(tx.amount) }}</span>
                    <div class="tx-actions">
                        <SyvoraButton variant="ghost" size="sm" @click="openEditTx(tx)">Edit</SyvoraButton>
                        <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDeleteTx(tx)">Delete</SyvoraButton>
                    </div>
                </div>
            </div>
        </div>

        <!-- ═══ Categories ═══ -->
        <div v-if="activeTab === 'categories'">
            <div class="tab-header">
                <div></div>
                <SyvoraButton @click="openCreateCat">+ New Category</SyvoraButton>
            </div>

            <div v-if="catLoading" class="loading-text">Loading…</div>
            <SyvoraEmptyState v-else-if="categories.length === 0" title="No categories" description="Create categories to organize your transactions." />
            <div v-else class="cat-list">
                <div v-for="cat in categories" :key="cat.id" class="cat-row">
                    <span class="cat-swatch" :style="{ background: cat.color }"></span>
                    <span class="cat-name">{{ cat.name }}</span>
                    <span class="cat-type-badge" :class="'cat-type--' + cat.type">{{ cat.type }}</span>
                    <div class="cat-actions">
                        <SyvoraButton variant="ghost" size="sm" @click="openEditCat(cat)">Edit</SyvoraButton>
                        <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDeleteCat(cat)">Delete</SyvoraButton>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- ═══ Transaction Modal ═══ -->
    <SyvoraModal v-if="showTxModal" :title="editingTx ? 'Edit Transaction' : 'New Transaction'" size="md" @close="showTxModal = false">
        <div class="modal-form">
            <div class="type-toggle">
                <button class="toggle-btn" :class="{ 'toggle-btn--active': txForm.type === 'income', 'toggle-btn--income': txForm.type === 'income' }" @click="txForm.type = 'income'">Income</button>
                <button class="toggle-btn" :class="{ 'toggle-btn--active': txForm.type === 'expense', 'toggle-btn--expense': txForm.type === 'expense' }" @click="txForm.type = 'expense'">Expense</button>
            </div>

            <SyvoraFormField label="Amount (CHF)" for="tx-amount">
                <SyvoraInput id="tx-amount" v-model="txForm.amount" type="number" placeholder="0.00" min="0.01" step="0.01" />
            </SyvoraFormField>

            <SyvoraFormField label="Description" for="tx-desc">
                <SyvoraInput id="tx-desc" v-model="txForm.description" placeholder="e.g. Venue rental for summer party" />
            </SyvoraFormField>

            <SyvoraFormField label="Category" for="tx-cat">
                <select id="tx-cat" v-model="txForm.category_id" class="native-select">
                    <option value="">— None —</option>
                    <option v-for="c in categoriesForType" :key="c.id" :value="c.id">{{ c.name }}</option>
                    <option value="__new__">+ Create new category</option>
                </select>
            </SyvoraFormField>

            <div v-if="isNewCategory" class="new-cat-inline">
                <SyvoraFormField label="Category Name" for="new-cat-name">
                    <SyvoraInput id="new-cat-name" v-model="newCatName" placeholder="e.g. Venue Costs" />
                </SyvoraFormField>
                <SyvoraFormField label="Color" for="new-cat-color">
                    <div class="color-row">
                        <input id="new-cat-color" v-model="newCatColor" type="color" class="color-input" />
                        <span class="color-hex">{{ newCatColor }}</span>
                    </div>
                </SyvoraFormField>
            </div>

            <SyvoraFormField label="Date" for="tx-date">
                <SyvoraInput id="tx-date" v-model="txForm.transaction_date" type="date" />
            </SyvoraFormField>

            <SyvoraFormField label="Linked Event" for="tx-event">
                <select id="tx-event" v-model="txForm.event_id" class="native-select">
                    <option value="">— None —</option>
                    <option v-for="e in events" :key="e.id" :value="e.id">{{ e.title }}</option>
                </select>
            </SyvoraFormField>

            <SyvoraFormField label="Linked Release" for="tx-release">
                <select id="tx-release" v-model="txForm.release_id" class="native-select">
                    <option value="">— None —</option>
                    <option v-for="r in releases" :key="r.id" :value="r.id">{{ r.title }}</option>
                </select>
            </SyvoraFormField>

            <p v-if="txError" class="error-msg">{{ txError }}</p>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="showTxModal = false">Cancel</SyvoraButton>
            <SyvoraButton :loading="savingTx" @click="saveTx">{{ editingTx ? 'Save Changes' : 'Create' }}</SyvoraButton>
        </template>
    </SyvoraModal>

    <!-- ═══ Category Modal ═══ -->
    <SyvoraModal v-if="showCatModal" :title="editingCat ? 'Edit Category' : 'New Category'" size="md" @close="showCatModal = false">
        <div class="modal-form">
            <SyvoraFormField label="Name" for="cat-name">
                <SyvoraInput id="cat-name" v-model="catForm.name" placeholder="e.g. Venue Costs" />
            </SyvoraFormField>

            <SyvoraFormField label="Type" for="cat-type">
                <select id="cat-type" v-model="catForm.type" class="native-select">
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                    <option value="both">Both</option>
                </select>
            </SyvoraFormField>

            <SyvoraFormField label="Color" for="cat-color">
                <div class="color-row">
                    <input id="cat-color" v-model="catForm.color" type="color" class="color-input" />
                    <span class="color-hex">{{ catForm.color }}</span>
                </div>
            </SyvoraFormField>

            <p v-if="catError" class="error-msg">{{ catError }}</p>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="showCatModal = false">Cancel</SyvoraButton>
            <SyvoraButton :loading="savingCat" @click="saveCat">{{ editingCat ? 'Save Changes' : 'Create' }}</SyvoraButton>
        </template>
    </SyvoraModal>
</template>

<style scoped>
.page { max-width: 1100px; margin: 0 auto; }

.page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    gap: 1rem;
}
.page-title { font-size: 1.75rem; font-weight: 800; margin: 0 0 0.25rem; color: var(--color-text); }
.page-subtitle { margin: 0; color: var(--color-text-muted); font-size: 0.9rem; }

.loading-text { color: var(--color-text-muted); text-align: center; padding: 3rem; }

/* Period filter */
.period-bar { display: flex; gap: 0.25rem; margin-bottom: 1.5rem; }
.period-btn {
    padding: 0.375rem 0.875rem; border-radius: 0.5rem; border: 1px solid var(--color-border);
    background: transparent; color: var(--color-text-muted); font-size: 0.8125rem;
    cursor: pointer; font-family: inherit; transition: all 0.15s;
}
.period-btn:hover { border-color: var(--color-accent); color: var(--color-text); }
.period-btn--active { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }

/* Summary cards */
.summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
.summary-card {
    background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 1rem;
    padding: 1.25rem; display: flex; flex-direction: column; gap: 0.25rem;
}
.summary-label { font-size: 0.8125rem; color: var(--color-text-muted); }
.summary-value { font-size: 1.5rem; font-weight: 700; color: var(--color-text); }
.summary-card--income { border-left: 3px solid #22c55e; }
.summary-card--expense { border-left: 3px solid #ef4444; }
.summary-card--positive { border-left: 3px solid #22c55e; }
.summary-card--positive .summary-value { color: #22c55e; }
.summary-card--negative { border-left: 3px solid #ef4444; }
.summary-card--negative .summary-value { color: #ef4444; }

/* Charts */
.charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem; }
@media (max-width: 768px) { .charts-row { grid-template-columns: 1fr; } }
.chart-box {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: 1rem; padding: 1.25rem;
}
.chart-title { font-size: 0.9375rem; font-weight: 600; margin: 0 0 1rem; color: var(--color-text); }
.chart-wrapper { height: 260px; position: relative; }
.chart-empty { color: var(--color-text-muted); text-align: center; padding: 2rem; font-size: 0.875rem; }

/* Recent / Transactions list */
.recent-section { margin-bottom: 2rem; }
.section-title { font-size: 1rem; font-weight: 700; margin: 0 0 1rem; color: var(--color-text); }

.tx-list { display: flex; flex-direction: column; gap: 0.5rem; }
.tx-row {
    display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem;
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: 0.75rem; flex-wrap: wrap;
}
.tx-row--interactive { transition: border-color 0.15s; }
.tx-row--interactive:hover { border-color: var(--color-accent); }

.tx-type-badge {
    font-size: 0.6875rem; font-weight: 600; text-transform: uppercase;
    padding: 0.15rem 0.5rem; border-radius: 0.375rem;
}
.tx-type--income { background: rgba(34,197,94,0.15); color: #22c55e; }
.tx-type--expense { background: rgba(239,68,68,0.15); color: #ef4444; }

.tx-desc { flex: 1; min-width: 120px; font-size: 0.875rem; color: var(--color-text); }
.tx-cat {
    font-size: 0.75rem; padding: 0.125rem 0.5rem; border-radius: 999px;
    border: 1px solid; color: var(--color-text-muted);
}
.tx-date { font-size: 0.75rem; color: var(--color-text-muted); white-space: nowrap; }
.tx-link { font-size: 0.75rem; color: var(--color-accent); white-space: nowrap; }
.tx-amount { font-weight: 700; font-size: 0.9375rem; white-space: nowrap; margin-left: auto; }
.tx-amount--income { color: #22c55e; }
.tx-amount--expense { color: #ef4444; }
.tx-actions { display: flex; gap: 0.25rem; }

/* Tab header */
.tab-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; gap: 1rem; flex-wrap: wrap; }

/* Filter bar */
.filter-bar { display: flex; gap: 0.25rem; }
.filter-btn {
    padding: 0.375rem 0.75rem; border-radius: 0.5rem; border: 1px solid var(--color-border);
    background: transparent; color: var(--color-text-muted); font-size: 0.8125rem;
    cursor: pointer; font-family: inherit; transition: all 0.15s;
}
.filter-btn:hover { border-color: var(--color-accent); }
.filter-btn--active { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }

/* Category list */
.cat-list { display: flex; flex-direction: column; gap: 0.5rem; }
.cat-row {
    display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem;
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: 0.75rem;
}
.cat-swatch { width: 1rem; height: 1rem; border-radius: 50%; flex-shrink: 0; }
.cat-name { font-size: 0.9375rem; font-weight: 600; color: var(--color-text); flex: 1; }
.cat-type-badge {
    font-size: 0.6875rem; font-weight: 600; text-transform: uppercase;
    padding: 0.15rem 0.5rem; border-radius: 0.375rem;
}
.cat-type--income { background: rgba(34,197,94,0.15); color: #22c55e; }
.cat-type--expense { background: rgba(239,68,68,0.15); color: #ef4444; }
.cat-type--both { background: rgba(115,195,254,0.15); color: var(--color-accent); }
.cat-actions { display: flex; gap: 0.25rem; }

/* Modal */
.modal-form { display: flex; flex-direction: column; gap: 1.25rem; }
.error-msg { color: var(--color-error, #f87171); font-size: 0.85rem; margin: 0; }

.type-toggle { display: flex; gap: 0.25rem; }
.toggle-btn {
    flex: 1; padding: 0.5rem; border: 1px solid var(--color-border);
    border-radius: 0.5rem; background: transparent; color: var(--color-text-muted);
    font-size: 0.875rem; font-weight: 600; cursor: pointer; font-family: inherit;
    transition: all 0.15s;
}
.toggle-btn--active.toggle-btn--income { background: rgba(34,197,94,0.15); color: #22c55e; border-color: #22c55e; }
.toggle-btn--active.toggle-btn--expense { background: rgba(239,68,68,0.15); color: #ef4444; border-color: #ef4444; }

.native-select {
    width: 100%; padding: 0.5rem 0.75rem; border-radius: 0.5rem;
    border: 1px solid var(--color-border); background: var(--color-surface);
    color: var(--color-text); font-size: 0.875rem; font-family: inherit;
}
.native-select:focus { outline: none; border-color: var(--color-accent); }

.color-row { display: flex; align-items: center; gap: 0.75rem; }
.color-input {
    width: 3rem; height: 2.25rem; border: 1px solid var(--color-border);
    border-radius: 0.375rem; cursor: pointer; padding: 0.125rem;
    background: transparent;
}
.color-hex { font-size: 0.875rem; color: var(--color-text-muted); font-family: monospace; }

.new-cat-inline {
    display: grid; grid-template-columns: 1fr auto; gap: 1rem;
    padding: 0.75rem; border-radius: 0.5rem;
    background: var(--color-surface-raised, rgba(255,255,255,0.04));
    border: 1px dashed var(--color-border);
}

:deep(.btn-danger) { color: var(--color-error, #f87171); }

@media (max-width: 600px) {
    .summary-cards { grid-template-columns: 1fr; }
    .summary-value { font-size: 1.2rem; }
    .tab-header { flex-direction: column; align-items: stretch; }
    .tab-header :deep(.syvora-btn) { width: 100%; }
    .period-bar { flex-wrap: wrap; }
    .cat-row { flex-wrap: wrap; }
    .new-cat-inline { grid-template-columns: 1fr; }
}
</style>
