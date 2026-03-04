<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useArtists, type Artist, type ArtistNote, type ArtistShow, type ArtistBooking } from '../composables/useArtists'
import {
    SyvoraButton, SyvoraModal, SyvoraFormField,
    SyvoraInput, SyvoraTextarea, SyvoraEmptyState,
    SyvoraTabs, SyvoraBadge,
} from '@syvora/ui'
import type { TabItem } from '@syvora/ui'

const route = useRoute()
const router = useRouter()
const artistId = computed(() => route.params.id as string)

const {
    artists, fetchArtists, fetchNotes, createNote, updateNote, deleteNote,
    fetchShows, createShow, updateShow, deleteShow,
    fetchBookings, createBooking, updateBooking, deleteBooking,
} = useArtists()

const artist = ref<Artist | null>(null)
const notes = ref<ArtistNote[]>([])
const shows = ref<ArtistShow[]>([])
const bookings = ref<ArtistBooking[]>([])
const loadingArtist = ref(true)
const loadingNotes = ref(true)
const loadingShows = ref(true)
const loadingBookings = ref(true)

const activeTab = ref('shows')

const tabs = computed<TabItem[]>(() => {
    const items: TabItem[] = [
        { key: 'shows', label: 'Shows', count: shows.value.length },
    ]
    if (artist.value?.is_managed) {
        items.push({ key: 'bookings', label: 'Bookings', count: bookings.value.length })
    }
    items.push({ key: 'notes', label: 'Notes', count: notes.value.length })
    return items
})

// Notes modal
const showModal = ref(false)
const editingNote = ref<ArtistNote | null>(null)
const saving = ref(false)
const error = ref('')
const form = ref({ title: '', content: '' })

// Shows modal
const showShowModal = ref(false)
const editingShow = ref<ArtistShow | null>(null)
const savingShow = ref(false)
const showError = ref('')
const showForm = ref({ show_name: '', show_date: '', slot_time: '', notes: '' })

// Bookings modal
const showBookingModal = ref(false)
const editingBooking = ref<ArtistBooking | null>(null)
const savingBooking = ref(false)
const bookingError = ref('')
const bookingForm = ref({
    label_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    venue_location: '',
    booking_date: '',
    slot_time: '',
    technical_rider: '',
    gage: '',
    status: 'pending',
    notes: '',
})

const bookingStatusVariant: Record<string, 'warning' | 'success' | 'muted' | 'error'> = {
    pending: 'warning',
    confirmed: 'success',
    completed: 'muted',
    cancelled: 'error',
}

onMounted(async () => {
    if (artists.value.length === 0) await fetchArtists()
    artist.value = artists.value.find(a => a.id === artistId.value) ?? null
    loadingArtist.value = false

    const promises: Promise<void>[] = [loadNotes(), loadShows()]
    if (artist.value?.is_managed) promises.push(loadBookings())
    await Promise.all(promises)
})

async function loadNotes() {
    loadingNotes.value = true
    notes.value = await fetchNotes(artistId.value)
    loadingNotes.value = false
}

async function loadShows() {
    loadingShows.value = true
    shows.value = await fetchShows(artistId.value)
    loadingShows.value = false
}

async function loadBookings() {
    loadingBookings.value = true
    bookings.value = await fetchBookings(artistId.value)
    loadingBookings.value = false
}

// Notes handlers
function openCreate() {
    editingNote.value = null
    form.value = { title: '', content: '' }
    error.value = ''
    showModal.value = true
}

function openEdit(note: ArtistNote) {
    editingNote.value = note
    form.value = { title: note.title, content: note.content }
    error.value = ''
    showModal.value = true
}

function closeModal() {
    showModal.value = false
    editingNote.value = null
}

async function saveNote() {
    if (!form.value.title.trim()) {
        error.value = 'Title is required.'
        return
    }
    saving.value = true
    error.value = ''
    try {
        if (editingNote.value) {
            await updateNote(editingNote.value.id, {
                title: form.value.title.trim(),
                content: form.value.content,
            })
        } else {
            await createNote(artistId.value, {
                title: form.value.title.trim(),
                content: form.value.content,
            })
        }
        await loadNotes()
        closeModal()
    } catch (e: any) {
        error.value = e.message ?? 'Failed to save.'
    } finally {
        saving.value = false
    }
}

async function handleDeleteNote(note: ArtistNote) {
    if (!confirm(`Delete note "${note.title}"?`)) return
    try {
        await deleteNote(note.id)
        notes.value = notes.value.filter(n => n.id !== note.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete.')
    }
}

// Shows handlers
function openCreateShow() {
    editingShow.value = null
    showForm.value = { show_name: '', show_date: '', slot_time: '', notes: '' }
    showError.value = ''
    showShowModal.value = true
}

function openEditShow(show: ArtistShow) {
    editingShow.value = show
    showForm.value = {
        show_name: show.show_name,
        show_date: show.show_date,
        slot_time: show.slot_time ?? '',
        notes: show.notes ?? '',
    }
    showError.value = ''
    showShowModal.value = true
}

function closeShowModal() {
    showShowModal.value = false
    editingShow.value = null
}

async function saveShow() {
    if (!showForm.value.show_name.trim()) {
        showError.value = 'Show name is required.'
        return
    }
    if (!showForm.value.show_date) {
        showError.value = 'Date is required.'
        return
    }
    savingShow.value = true
    showError.value = ''
    try {
        const payload = {
            show_name: showForm.value.show_name.trim(),
            show_date: showForm.value.show_date,
            slot_time: showForm.value.slot_time || null,
            notes: showForm.value.notes || null,
        }
        if (editingShow.value) {
            await updateShow(editingShow.value.id, payload)
        } else {
            await createShow(artistId.value, payload)
        }
        await loadShows()
        closeShowModal()
    } catch (e: any) {
        showError.value = e.message ?? 'Failed to save.'
    } finally {
        savingShow.value = false
    }
}

async function handleDeleteShow(show: ArtistShow) {
    if (!confirm(`Remove show "${show.show_name}"?`)) return
    try {
        await deleteShow(show.id)
        shows.value = shows.value.filter(s => s.id !== show.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete.')
    }
}

// Bookings handlers
function openCreateBooking() {
    editingBooking.value = null
    bookingForm.value = {
        label_name: '', contact_name: '', contact_email: '', contact_phone: '',
        venue_location: '', booking_date: '', slot_time: '', technical_rider: '',
        gage: '', status: 'pending', notes: '',
    }
    bookingError.value = ''
    showBookingModal.value = true
}

function openEditBooking(booking: ArtistBooking) {
    editingBooking.value = booking
    bookingForm.value = {
        label_name: booking.label_name,
        contact_name: booking.contact_name,
        contact_email: booking.contact_email ?? '',
        contact_phone: booking.contact_phone ?? '',
        venue_location: booking.venue_location ?? '',
        booking_date: booking.booking_date,
        slot_time: booking.slot_time ?? '',
        technical_rider: booking.technical_rider ?? '',
        gage: booking.gage != null ? String(booking.gage) : '',
        status: booking.status,
        notes: booking.notes ?? '',
    }
    bookingError.value = ''
    showBookingModal.value = true
}

function closeBookingModal() {
    showBookingModal.value = false
    editingBooking.value = null
}

async function saveBooking() {
    if (!bookingForm.value.label_name.trim()) {
        bookingError.value = 'Label / promoter name is required.'
        return
    }
    if (!bookingForm.value.contact_name.trim()) {
        bookingError.value = 'Contact name is required.'
        return
    }
    if (!bookingForm.value.booking_date) {
        bookingError.value = 'Date is required.'
        return
    }
    savingBooking.value = true
    bookingError.value = ''
    try {
        const payload = {
            label_name: bookingForm.value.label_name.trim(),
            contact_name: bookingForm.value.contact_name.trim(),
            contact_email: bookingForm.value.contact_email || null,
            contact_phone: bookingForm.value.contact_phone || null,
            venue_location: bookingForm.value.venue_location || null,
            booking_date: bookingForm.value.booking_date,
            slot_time: bookingForm.value.slot_time || null,
            technical_rider: bookingForm.value.technical_rider || null,
            gage: bookingForm.value.gage ? Number(bookingForm.value.gage) : null,
            notes: bookingForm.value.notes || null,
        }
        if (editingBooking.value) {
            await updateBooking(editingBooking.value.id, { ...payload, status: bookingForm.value.status })
        } else {
            await createBooking(artistId.value, payload)
        }
        await loadBookings()
        closeBookingModal()
    } catch (e: any) {
        bookingError.value = e.message ?? 'Failed to save.'
    } finally {
        savingBooking.value = false
    }
}

async function handleDeleteBooking(booking: ArtistBooking) {
    if (!confirm(`Delete booking "${booking.label_name}"?`)) return
    try {
        await deleteBooking(booking.id)
        bookings.value = bookings.value.filter(b => b.id !== booking.id)
    } catch (e: any) {
        alert(e.message ?? 'Failed to delete.')
    }
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}
</script>

<template>
    <div class="page">
        <button class="back-btn" @click="router.push('/artists')">← Artists</button>

        <div v-if="loadingArtist" class="loading-text">Loading…</div>

        <template v-else-if="artist">
            <div class="artist-header">
                <div class="artist-avatar">
                    <img v-if="artist.picture_url" :src="artist.picture_url" :alt="artist.name" />
                    <div v-else class="artist-avatar-placeholder">
                        {{ artist.name.charAt(0).toUpperCase() }}
                    </div>
                </div>
                <div class="artist-info">
                    <div class="artist-name-row">
                        <h1 class="artist-name">{{ artist.name }}</h1>
                        <span v-if="artist.is_managed" class="managed-badge">Managed by EB</span>
                    </div>
                    <p class="artist-since">Artist since {{ formatDate(artist.created_at) }}</p>
                </div>
            </div>

            <SyvoraTabs v-model="activeTab" :tabs="tabs" />

            <!-- Shows tab -->
            <div v-if="activeTab === 'shows'" class="tab-content">
                <div class="section-header">
                    <h2 class="section-title">Shows</h2>
                    <SyvoraButton @click="openCreateShow">+ Add Show</SyvoraButton>
                </div>

                <div v-if="loadingShows" class="loading-text">Loading shows…</div>

                <SyvoraEmptyState
                    v-else-if="shows.length === 0"
                    title="No shows yet"
                    description="Assign this artist to a show to track their bookings."
                />

                <div v-else class="shows-list">
                    <div v-for="show in shows" :key="show.id" class="show-card">
                        <div class="show-main">
                            <div class="show-info">
                                <span class="show-name">{{ show.show_name }}</span>
                                <div class="show-meta">
                                    <span class="show-date">{{ formatDate(show.show_date) }}</span>
                                    <span v-if="show.slot_time" class="show-slot">· Slot: {{ show.slot_time.slice(0, 5) }}</span>
                                </div>
                                <p v-if="show.notes" class="show-notes">{{ show.notes }}</p>
                            </div>
                            <div class="show-actions">
                                <SyvoraButton variant="ghost" size="sm" @click="openEditShow(show)">Edit</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDeleteShow(show)">Remove</SyvoraButton>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Bookings tab -->
            <div v-if="activeTab === 'bookings'" class="tab-content">
                <div class="section-header">
                    <h2 class="section-title">Bookings</h2>
                    <SyvoraButton @click="openCreateBooking">+ New Booking</SyvoraButton>
                </div>

                <div v-if="loadingBookings" class="loading-text">Loading bookings…</div>

                <SyvoraEmptyState
                    v-else-if="bookings.length === 0"
                    title="No bookings yet"
                    description="Track booking requests and offers for this artist."
                />

                <div v-else class="bookings-list">
                    <div v-for="booking in bookings" :key="booking.id" class="booking-card">
                        <div class="booking-main">
                            <div class="booking-info">
                                <div class="booking-top-row">
                                    <span class="booking-label">{{ booking.label_name }}</span>
                                    <SyvoraBadge :variant="bookingStatusVariant[booking.status]">{{ booking.status }}</SyvoraBadge>
                                </div>
                                <div class="booking-meta">
                                    <span>{{ formatDate(booking.booking_date) }}</span>
                                    <span v-if="booking.slot_time" class="booking-slot">· {{ booking.slot_time.slice(0, 5) }}</span>
                                    <span v-if="booking.venue_location"> · {{ booking.venue_location }}</span>
                                </div>
                                <div class="booking-contact">
                                    <span>{{ booking.contact_name }}</span>
                                    <span v-if="booking.contact_email"> · {{ booking.contact_email }}</span>
                                    <span v-if="booking.contact_phone"> · {{ booking.contact_phone }}</span>
                                </div>
                                <div v-if="booking.gage != null" class="booking-gage">
                                    Gage: {{ Number(booking.gage).toLocaleString(undefined, { style: 'currency', currency: 'EUR' }) }}
                                </div>
                                <p v-if="booking.notes" class="booking-notes">{{ booking.notes }}</p>
                            </div>
                            <div class="booking-actions">
                                <SyvoraButton variant="ghost" size="sm" @click="openEditBooking(booking)">Edit</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDeleteBooking(booking)">Delete</SyvoraButton>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Notes tab -->
            <div v-if="activeTab === 'notes'" class="tab-content">
                <div class="section-header">
                    <h2 class="section-title">Notes</h2>
                    <SyvoraButton @click="openCreate">+ New Note</SyvoraButton>
                </div>

                <div v-if="loadingNotes" class="loading-text">Loading notes…</div>

                <SyvoraEmptyState
                    v-else-if="notes.length === 0"
                    title="No notes yet"
                    description="Create a note to track information about this artist."
                />

                <div v-else class="notes-list">
                    <div v-for="note in notes" :key="note.id" class="note-card">
                        <div class="note-header">
                            <h3 class="note-title">{{ note.title }}</h3>
                            <div class="note-actions">
                                <SyvoraButton variant="ghost" size="sm" @click="openEdit(note)">Edit</SyvoraButton>
                                <SyvoraButton variant="ghost" size="sm" class="btn-danger" @click="handleDeleteNote(note)">Delete</SyvoraButton>
                            </div>
                        </div>
                        <div class="note-content">
                            <p v-if="note.content" class="note-text">{{ note.content }}</p>
                            <p v-else class="note-empty">No content.</p>
                        </div>
                        <div class="note-meta">
                            <span v-if="note.creator_name">by {{ note.creator_name }}</span>
                            <span>{{ formatDateTime(note.created_at) }}</span>
                            <span v-if="note.updater_name"> · edited by {{ note.updater_name }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <div v-else class="loading-text">Artist not found.</div>
    </div>

    <!-- Show modal -->
    <SyvoraModal
        v-if="showShowModal"
        :title="editingShow ? 'Edit Show' : 'Add Show'"
        size="lg"
        @close="closeShowModal"
    >
        <div class="modal-form">
            <SyvoraFormField label="Show / Event name" for="show-name">
                <SyvoraInput id="show-name" v-model="showForm.show_name" placeholder="e.g. Fabric London, Awakenings, …" />
            </SyvoraFormField>

            <SyvoraFormField label="Date" for="show-date">
                <SyvoraInput id="show-date" v-model="showForm.show_date" type="date" />
            </SyvoraFormField>

            <SyvoraFormField label="Slot time (optional)" for="show-slot">
                <SyvoraInput id="show-slot" v-model="showForm.slot_time" type="time" />
            </SyvoraFormField>

            <SyvoraFormField label="Notes (optional)" for="show-notes">
                <SyvoraTextarea
                    id="show-notes"
                    v-model="showForm.notes"
                    placeholder="Stage, fee, contact, …"
                    :rows="4"
                />
            </SyvoraFormField>

            <p v-if="showError" class="error-msg">{{ showError }}</p>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="closeShowModal">Cancel</SyvoraButton>
            <SyvoraButton :loading="savingShow" @click="saveShow">{{ editingShow ? 'Save Changes' : 'Add Show' }}</SyvoraButton>
        </template>
    </SyvoraModal>

    <!-- Note modal -->
    <SyvoraModal
        v-if="showModal"
        :title="editingNote ? 'Edit Note' : 'New Note'"
        size="lg"
        @close="closeModal"
    >
        <div class="modal-form">
            <SyvoraFormField label="Title" for="note-title">
                <SyvoraInput id="note-title" v-model="form.title" placeholder="Note title" />
            </SyvoraFormField>

            <SyvoraFormField label="Content" for="note-content">
                <SyvoraTextarea
                    id="note-content"
                    v-model="form.content"
                    placeholder="Write your note here…"
                    :rows="12"
                />
            </SyvoraFormField>

            <p v-if="error" class="error-msg">{{ error }}</p>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="closeModal">Cancel</SyvoraButton>
            <SyvoraButton :loading="saving" @click="saveNote">{{ editingNote ? 'Save Changes' : 'Create Note' }}</SyvoraButton>
        </template>
    </SyvoraModal>

    <!-- Booking modal -->
    <SyvoraModal
        v-if="showBookingModal"
        :title="editingBooking ? 'Edit Booking' : 'New Booking'"
        size="lg"
        @close="closeBookingModal"
    >
        <div class="modal-form">
            <SyvoraFormField label="Label / Promoter name" for="booking-label">
                <SyvoraInput id="booking-label" v-model="bookingForm.label_name" placeholder="e.g. Drumcode, Afterlife, …" />
            </SyvoraFormField>

            <SyvoraFormField label="Contact name" for="booking-contact">
                <SyvoraInput id="booking-contact" v-model="bookingForm.contact_name" placeholder="Full name" />
            </SyvoraFormField>

            <div class="form-row">
                <SyvoraFormField label="Contact email (optional)" for="booking-email">
                    <SyvoraInput id="booking-email" v-model="bookingForm.contact_email" type="email" placeholder="email@example.com" />
                </SyvoraFormField>

                <SyvoraFormField label="Contact phone (optional)" for="booking-phone">
                    <SyvoraInput id="booking-phone" v-model="bookingForm.contact_phone" type="tel" placeholder="+31 6 …" />
                </SyvoraFormField>
            </div>

            <SyvoraFormField label="Venue / Location (optional)" for="booking-venue">
                <SyvoraInput id="booking-venue" v-model="bookingForm.venue_location" placeholder="e.g. Gashouder, Amsterdam" />
            </SyvoraFormField>

            <div class="form-row">
                <SyvoraFormField label="Date" for="booking-date">
                    <SyvoraInput id="booking-date" v-model="bookingForm.booking_date" type="date" />
                </SyvoraFormField>

                <SyvoraFormField label="Slot time (optional)" for="booking-slot">
                    <SyvoraInput id="booking-slot" v-model="bookingForm.slot_time" type="time" />
                </SyvoraFormField>
            </div>

            <SyvoraFormField label="Gage (optional)" for="booking-gage">
                <SyvoraInput id="booking-gage" v-model="bookingForm.gage" type="number" placeholder="0.00" />
            </SyvoraFormField>

            <SyvoraFormField label="Technical rider (optional)" for="booking-rider">
                <SyvoraTextarea
                    id="booking-rider"
                    v-model="bookingForm.technical_rider"
                    placeholder="Equipment, stage requirements, …"
                    :rows="4"
                />
            </SyvoraFormField>

            <SyvoraFormField label="Notes (optional)" for="booking-notes">
                <SyvoraTextarea
                    id="booking-notes"
                    v-model="bookingForm.notes"
                    placeholder="Additional notes…"
                    :rows="3"
                />
            </SyvoraFormField>

            <SyvoraFormField v-if="editingBooking" label="Status" for="booking-status">
                <select id="booking-status" v-model="bookingForm.status" class="status-select">
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                </select>
            </SyvoraFormField>

            <p v-if="bookingError" class="error-msg">{{ bookingError }}</p>
        </div>
        <template #footer>
            <SyvoraButton variant="ghost" @click="closeBookingModal">Cancel</SyvoraButton>
            <SyvoraButton :loading="savingBooking" @click="saveBooking">{{ editingBooking ? 'Save Changes' : 'Create Booking' }}</SyvoraButton>
        </template>
    </SyvoraModal>
</template>

<style scoped>
.page {
    max-width: 800px;
    margin: 0 auto;
}

.back-btn {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    cursor: pointer;
    padding: 0;
    margin-bottom: 1.5rem;
    transition: color 0.15s;
}

.back-btn:hover {
    color: var(--color-text);
}

.loading-text {
    color: var(--color-text-muted);
    text-align: center;
    padding: 3rem;
}

/* Artist header */
.artist-header {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
}

.artist-avatar {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    border: 2px solid var(--color-border);
}

.artist-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.artist-avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--color-accent);
    background: var(--color-surface-raised, rgba(255,255,255,0.04));
}

.artist-name-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.artist-name {
    font-size: 2rem;
    font-weight: 800;
    margin: 0;
    color: var(--color-text);
}

.managed-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.2rem 0.6rem;
    font-size: 0.7rem;
    font-weight: 600;
    border-radius: 999px;
    background: var(--color-accent);
    color: var(--color-text-on-accent, #fff);
    white-space: nowrap;
}

.artist-since {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.875rem;
}

/* Tab content */
.tab-content {
    margin-top: 1.5rem;
}

/* Shared section header */
.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;
}

.section-title {
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0;
    color: var(--color-text);
}

/* Shows */
.shows-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.show-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.875rem;
    padding: 1rem 1.25rem;
    transition: border-color 0.15s;
}

.show-card:hover {
    border-color: var(--color-accent);
}

.show-main {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
}

.show-info {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
}

.show-name {
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-text);
}

.show-meta {
    display: flex;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--color-text-muted);
}

.show-slot {
    color: var(--color-accent);
}

.show-notes {
    margin: 0.25rem 0 0;
    font-size: 0.82rem;
    color: var(--color-text-muted);
    white-space: pre-wrap;
}

.show-actions {
    display: flex;
    gap: 0.375rem;
    flex-shrink: 0;
}

/* Bookings */
.bookings-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.booking-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.875rem;
    padding: 1rem 1.25rem;
    transition: border-color 0.15s;
}

.booking-card:hover {
    border-color: var(--color-accent);
}

.booking-main {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
}

.booking-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
}

.booking-top-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.booking-label {
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-text);
}

.booking-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--color-text-muted);
}

.booking-slot {
    color: var(--color-accent);
}

.booking-contact {
    font-size: 0.8rem;
    color: var(--color-text-muted);
}

.booking-gage {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-accent);
}

.booking-notes {
    margin: 0.25rem 0 0;
    font-size: 0.82rem;
    color: var(--color-text-muted);
    white-space: pre-wrap;
}

.booking-actions {
    display: flex;
    gap: 0.375rem;
    flex-shrink: 0;
}

/* Notes */
.notes-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.note-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.875rem;
    padding: 1.25rem 1.5rem;
    transition: border-color 0.15s;
}

.note-card:hover {
    border-color: var(--color-accent);
}

.note-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 0.75rem;
}

.note-title {
    font-size: 1rem;
    font-weight: 700;
    margin: 0;
    color: var(--color-text);
}

.note-actions {
    display: flex;
    gap: 0.375rem;
    flex-shrink: 0;
}

.note-content {
    margin-bottom: 0.75rem;
}

.note-text {
    margin: 0;
    color: var(--color-text);
    font-size: 0.9rem;
    line-height: 1.65;
    white-space: pre-wrap;
    word-break: break-word;
}

.note-empty {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    font-style: italic;
}

.note-meta {
    font-size: 0.73rem;
    color: var(--color-text-muted);
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
}

/* Modal */
.modal-form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
}

.form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
}

.error-msg {
    color: var(--color-error, #f87171);
    font-size: 0.85rem;
    margin: 0;
}

.status-select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 0.875rem;
    outline: none;
    transition: border-color 0.15s;
}

.status-select:focus {
    border-color: var(--color-accent);
}

:deep(.btn-danger) {
    color: var(--color-error, #f87171);
}
</style>
