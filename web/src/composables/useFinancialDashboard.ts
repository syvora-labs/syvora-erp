import { computed, ref, type Ref } from 'vue'
import type { FinancialTransaction } from './useFinancialTransactions'

export type DashboardPeriod = 'month' | 'quarter' | 'year' | 'all'

export function useFinancialDashboard(transactions: Ref<FinancialTransaction[]>) {
    const period = ref<DashboardPeriod>('year')

    const filteredTransactions = computed(() => {
        const confirmed = transactions.value.filter(t => !t.is_pending)
        if (period.value === 'all') return confirmed
        const now = new Date()
        let cutoff: Date
        if (period.value === 'month') {
            cutoff = new Date(now.getFullYear(), now.getMonth(), 1)
        } else if (period.value === 'quarter') {
            const qMonth = Math.floor(now.getMonth() / 3) * 3
            cutoff = new Date(now.getFullYear(), qMonth, 1)
        } else {
            cutoff = new Date(now.getFullYear(), 0, 1)
        }
        return confirmed.filter(t => new Date(t.transaction_date) >= cutoff)
    })

    const totalIncome = computed(() =>
        filteredTransactions.value
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0)
    )

    const totalExpenses = computed(() =>
        filteredTransactions.value
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0)
    )

    const netBalance = computed(() => totalIncome.value - totalExpenses.value)

    const monthlyChartData = computed(() => {
        const months: Record<string, { income: number; expense: number }> = {}
        for (const t of filteredTransactions.value) {
            const d = new Date(t.transaction_date)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            if (!months[key]) months[key] = { income: 0, expense: 0 }
            months[key][t.type] += t.amount
        }
        const sorted = Object.entries(months).sort(([a], [b]) => a.localeCompare(b))
        return {
            labels: sorted.map(([key]) => {
                const [y, m] = key.split('-')
                return new Date(Number(y), Number(m) - 1).toLocaleDateString('de-CH', { month: 'short', year: '2-digit' })
            }),
            income: sorted.map(([, v]) => v.income),
            expenses: sorted.map(([, v]) => v.expense),
        }
    })

    const categoryChartData = computed(() => {
        const cats: Record<string, { amount: number; color: string }> = {}
        for (const t of filteredTransactions.value.filter(t => t.type === 'expense')) {
            const name = t.category_name ?? 'Uncategorized'
            const color = t.category_color ?? '#666'
            if (!cats[name]) cats[name] = { amount: 0, color }
            cats[name].amount += t.amount
        }
        const entries = Object.entries(cats).sort(([, a], [, b]) => b.amount - a.amount)
        return {
            labels: entries.map(([name]) => name),
            amounts: entries.map(([, v]) => v.amount),
            colors: entries.map(([, v]) => v.color),
        }
    })

    const recentTransactions = computed(() =>
        filteredTransactions.value.slice(0, 10)
    )

    return {
        period,
        filteredTransactions,
        totalIncome,
        totalExpenses,
        netBalance,
        monthlyChartData,
        categoryChartData,
        recentTransactions,
    }
}
