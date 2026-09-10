import { enrollTotp } from './mfa'

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      mfa: {
        enroll: vi.fn().mockResolvedValue({
          data: { id: 'f1', totp: { qr_code: '<svg/>', secret: 'ABC123' } },
          error: null,
        }),
      },
    },
  },
}))

test('enrollTotp returns factor id, qr, secret', async () => {
  const r = await enrollTotp()
  expect(r).toEqual({ factorId: 'f1', qrSvg: '<svg/>', secret: 'ABC123' })
})
