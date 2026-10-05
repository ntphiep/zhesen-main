import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountSettings } from '@/components/account/AccountSettings'
import { ReminderPanel } from '@/components/account/ReminderPanel'
import { pushSupport, registerWorker, subscribe, type PushSupport } from '@/lib/push/browser'
import { refreshDevice, setReminderHour, turnOffReminder, turnOnReminder } from '@/lib/push/reminders'
import type { WordlistStats } from '@/lib/wordlist/stats'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/push/browser', async (orig) => ({
  ...(await orig<typeof import('@/lib/push/browser')>()),
  pushSupport: vi.fn((): PushSupport => 'ok'),
  registerWorker: vi.fn(),
  subscribe: vi.fn(),
  deviceKeys: vi.fn(() => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'p', auth: 'a' })),
}))
vi.mock('@/lib/push/reminders', async (orig) => ({
  ...(await orig<typeof import('@/lib/push/reminders')>()),
  turnOnReminder: vi.fn(async () => ({ ok: true as const })),
  refreshDevice: vi.fn(async () => true),
  setReminderHour: vi.fn(async () => ({ ok: true as const })),
  turnOffReminder: vi.fn(async () => ({ ok: true as const })),
}))

const KEY = 'B' + 'A'.repeat(86)
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
const unsubscribe = vi.fn(async () => true)
const browserSubscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', unsubscribe }

/** A worker registration whose browser holds a subscription or not. */
function worker(subscribed: boolean) {
  const registration = { pushManager: { getSubscription: vi.fn(async () => (subscribed ? browserSubscription : null)) } }
  vi.mocked(registerWorker).mockResolvedValue(registration as unknown as ServiceWorkerRegistration)
  return registration
}

function show(current: { hour: number; timeZone: string } | null = null) {
  return render(<ReminderPanel publicKey={KEY} userId="u1" current={current} />)
}

/** The worker has registered once the button is there and enabled. */
async function ready(name: string) {
  const button = await screen.findByRole('button', { name })
  await waitFor(() => expect(button).toBeEnabled())
  return button
}

beforeEach(() => {
  // Reset, not clear: a test that makes a write fail must not leak it into the next.
  vi.resetAllMocks()
  vi.mocked(pushSupport).mockReturnValue('ok')
  vi.mocked(subscribe).mockResolvedValue(browserSubscription as unknown as PushSubscription)
  worker(false)
})

const stats: WordlistStats = {
  total: 0, due: 0, learned: 0, reviewedToday: 0, streak: 0,
  byStatus: { new: 0, learning: 0, known: 0 }, byLang: { en: 0, es: 0, zh: 0 },
}

describe('AccountSettings', () => {
  it('draws no reminder panel without a VAPID key', () => {
    render(<AccountSettings email="a@b.com" profile={null} stats={stats} joinedAt={null} />)
    expect(screen.queryByRole('heading', { name: 'Nhắc ôn' })).toBeNull()
  })

  it('draws the panel beside the others when the key is there', () => {
    render(
      <AccountSettings email="a@b.com" profile={null} stats={stats} joinedAt={null}
        reminders={{ publicKey: KEY, userId: 'u1', current: null }} />,
    )
    expect(screen.getByRole('heading', { name: 'Nhắc ôn' })).toBeInTheDocument()
    expect(screen.getByText('Nhận một thông báo mỗi ngày khi có từ đến hạn ôn.')).toBeInTheDocument()
  })
})

describe('ReminderPanel', () => {
  it('offers the hours 06:00 to 22:00 with 20:00 picked', () => {
    show()
    const hour = screen.getByRole('combobox', { name: 'Giờ nhắc' })
    expect(hour).toHaveValue('20')
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options[0]).toBe('06:00')
    expect(options.at(-1)).toBe('22:00')
    expect(options).toHaveLength(17)
  })

  it('subscribes inside the click, then turns the reminder on', async () => {
    show()
    const button = await ready('Bật nhắc')
    fireEvent.click(button)
    // Synchronously, before any await: Safari prompts only from inside the gesture.
    expect(subscribe).toHaveBeenCalledWith(expect.anything(), KEY)

    expect(await screen.findByText('Đã bật nhắc.')).toBeInTheDocument()
    expect(turnOnReminder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ endpoint: browserSubscription.endpoint }), 20, zone)
    expect(screen.getByRole('button', { name: 'Tắt nhắc' })).toBeInTheDocument()
  })

  it('turns on at the hour picked first', async () => {
    show()
    await ready('Bật nhắc')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Giờ nhắc' }), '7')
    expect(setReminderHour).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Bật nhắc' }))
    await screen.findByText('Đã bật nhắc.')
    expect(turnOnReminder).toHaveBeenCalledWith(expect.anything(), expect.anything(), 7, zone)
  })

  it('says so when the browser could not subscribe', async () => {
    vi.mocked(subscribe).mockRejectedValue(new DOMException('push service error', 'AbortError'))
    show()
    await userEvent.click(await ready('Bật nhắc'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa bật được nhắc. Thử lại.')
    expect(turnOnReminder).not.toHaveBeenCalled()
  })

  it('says so when the reminder could not be saved', async () => {
    vi.mocked(turnOnReminder).mockResolvedValue({ ok: false, message: 'Chưa bật được nhắc. Thử lại.' })
    show()
    await userEvent.click(await ready('Bật nhắc'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa bật được nhắc. Thử lại.')
    expect(screen.getByRole('button', { name: 'Bật nhắc' })).toBeInTheDocument()
  })

  it('shows the blocked line, not a retry, when the prompt was refused', async () => {
    vi.mocked(subscribe).mockImplementation(async () => {
      vi.mocked(pushSupport).mockReturnValue('blocked')
      throw new DOMException('denied', 'NotAllowedError')
    })
    show()
    await userEvent.click(await ready('Bật nhắc'))
    expect(await screen.findByText('Trình duyệt đang chặn thông báo. Cho phép thông báo trong cài đặt trình duyệt.')).toBeInTheDocument()
    expect(screen.queryByText('Chưa bật được nhắc. Thử lại.')).toBeNull()
  })

  it.each([
    ['install', 'Thêm Zhesen vào Màn hình chính để bật nhắc.'],
    ['blocked', 'Trình duyệt đang chặn thông báo. Cho phép thông báo trong cài đặt trình duyệt.'],
    ['none', 'Trình duyệt này không hỗ trợ thông báo.'],
  ] as const)('says what is missing when support is %s, with nothing to press', (support, line) => {
    vi.mocked(pushSupport).mockReturnValue(support)
    show()
    expect(screen.getByRole('alert')).toHaveTextContent(line)
    expect(screen.queryByRole('button')).toBeNull()
    expect(registerWorker).not.toHaveBeenCalled()
  })

  it('still lets a learner change the hour or turn off from a browser without push', async () => {
    vi.mocked(pushSupport).mockReturnValue('blocked')
    show({ hour: 8, timeZone: 'Asia/Ho_Chi_Minh' })
    expect(screen.getByRole('combobox', { name: 'Giờ nhắc' })).toHaveValue('8')
    await userEvent.click(screen.getByRole('button', { name: 'Tắt nhắc' }))
    expect(await screen.findByText('Đã tắt nhắc.')).toBeInTheDocument()
    expect(turnOffReminder).toHaveBeenCalledWith(expect.anything(), 'u1')
  })

  it('offers this browser when the reminder is on elsewhere only', async () => {
    show({ hour: 21, timeZone: 'Asia/Ho_Chi_Minh' })
    fireEvent.click(await ready('Bật trên thiết bị này'))
    expect(subscribe).toHaveBeenCalled()
    expect(await screen.findByText('Đã bật nhắc.')).toBeInTheDocument()
    expect(turnOnReminder).toHaveBeenCalledWith(expect.anything(), expect.anything(), 21, zone)
    expect(screen.queryByRole('button', { name: 'Bật trên thiết bị này' })).toBeNull()
    expect(refreshDevice).not.toHaveBeenCalled()
  })

  it('stores this browser again on a visit, and offers nothing more', async () => {
    worker(true)
    show({ hour: 21, timeZone: 'Asia/Ho_Chi_Minh' })
    await waitFor(() => expect(refreshDevice).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: 'Bật trên thiết bị này' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Tắt nhắc' })).toBeInTheDocument()
  })

  it('saves a new hour while on', async () => {
    worker(true)
    show({ hour: 20, timeZone: 'Asia/Ho_Chi_Minh' })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Giờ nhắc' }), '7')
    expect(await screen.findByText('Đã lưu.')).toBeInTheDocument()
    expect(setReminderHour).toHaveBeenCalledWith(expect.anything(), 7, zone)
  })

  it('says so when the hour could not be saved', async () => {
    vi.mocked(setReminderHour).mockResolvedValue({ ok: false, message: 'Chưa lưu được giờ nhắc. Thử lại.' })
    worker(true)
    show({ hour: 20, timeZone: 'Asia/Ho_Chi_Minh' })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Giờ nhắc' }), '9')
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa lưu được giờ nhắc. Thử lại.')
  })

  it('turns off everywhere and drops this browser subscription', async () => {
    worker(true)
    show({ hour: 20, timeZone: 'Asia/Ho_Chi_Minh' })
    await waitFor(() => expect(refreshDevice).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: 'Tắt nhắc' }))
    expect(await screen.findByText('Đã tắt nhắc.')).toBeInTheDocument()
    expect(turnOffReminder).toHaveBeenCalledWith(expect.anything(), 'u1')
    expect(unsubscribe).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Bật nhắc' })).toBeInTheDocument()
  })

  it('stays on when turning off failed', async () => {
    vi.mocked(turnOffReminder).mockResolvedValue({ ok: false, message: 'Chưa tắt được nhắc. Thử lại.' })
    worker(true)
    show({ hour: 20, timeZone: 'Asia/Ho_Chi_Minh' })
    await userEvent.click(screen.getByRole('button', { name: 'Tắt nhắc' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tắt được nhắc. Thử lại.')
    expect(unsubscribe).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Tắt nhắc' })).toBeInTheDocument()
  })
})
