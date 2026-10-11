import type { Lang } from './i18n'

// The customer how-to guide (/help), in both languages. Keep it in step with
// what CustomerOrderView actually shows.

export type HelpSection = { key: string; title: string; body: string[] }

export const HELP: Record<
  Lang,
  { title: string; intro: string; back: string; sections: HelpSection[]; footer: string }
> = {
  en: {
    title: 'How to use your order link',
    intro:
      'Every delivery day we send you a link on LINE. Open it any time to follow your order — no login needed.',
    back: 'Back to my order',
    sections: [
      {
        key: 'status',
        title: 'Order status',
        body: [
          'The steps show where your order is: Received → Packed → At the pier → Shipped.',
          'Once it is on the boat you also see which boat it is on.',
          'Several orders today? They are listed at the top — tap “View” to open each one.',
        ],
      },
      {
        key: 'items',
        title: 'Your items',
        body: [
          'Every item with the quantity ordered and shipped, split into fresh and dry goods.',
          'Anything Makro could not supply is marked “Short” and listed under Shortages.',
          'If there is an amount to pay on delivery, it is shown in the box at the top.',
        ],
      },
      {
        key: 'photos',
        title: 'Photos of your boxes',
        body: [
          'Photos taken when your order was packed and when it was loaded on the boat.',
          'Tap a photo to see it full size and swipe between photos.',
        ],
      },
      {
        key: 'claim',
        title: 'Report a problem',
        body: [
          'Something missing, damaged, or broken eggs? Tap “Report a problem” within 48 hours after the boat leaves.',
          'Choose the problem, tick the items and how many, add a short note and photos, then submit.',
          'Broken eggs are counted by the egg and need at least one photo.',
          'Your report and its status appear on the same page.',
        ],
      },
      {
        key: 'foam',
        title: 'Foam boxes',
        body: [
          'Fresh food comes in Makro foam boxes. A red banner shows how many you are holding.',
          'Please hand empty boxes back to the boat on its next delivery.',
        ],
      },
      {
        key: 'expiry',
        title: 'How long the link works',
        body: [
          'The link keeps working until 48 hours after your order is shipped.',
          'Store pickup orders show “Picked up at the store” once collected.',
        ],
      },
    ],
    footer: 'Questions? Ask us in the pier LINE group.',
  },
  th: {
    title: 'วิธีใช้ลิงก์ติดตามออเดอร์',
    intro:
      'ทุกวันที่มีของส่ง เราจะส่งลิงก์ให้ทาง LINE เปิดดูได้ตลอดเวลาโดยไม่ต้องล็อกอิน',
    back: 'กลับไปที่ออเดอร์',
    sections: [
      {
        key: 'status',
        title: 'สถานะออเดอร์',
        body: [
          'แถบขั้นตอนบอกว่าออเดอร์อยู่ตรงไหน: รับออเดอร์แล้ว → แพ็คเสร็จ → ถึงท่าเรือ → ส่งขึ้นเรือแล้ว',
          'เมื่อของขึ้นเรือแล้ว จะเห็นชื่อเรือที่ของไปด้วย',
          'วันนี้มีหลายออเดอร์? จะขึ้นรายการด้านบน กด “ดู” เพื่อเปิดแต่ละออเดอร์',
        ],
      },
      {
        key: 'items',
        title: 'รายการสินค้า',
        body: [
          'ทุกรายการพร้อมจำนวนที่สั่งและที่ส่งจริง แยกของสดกับของแห้ง',
          'รายการที่แม็คโครส่งไม่ครบจะมีป้าย “ขาด” และสรุปไว้ในหัวข้อของขาด',
          'ถ้ามียอดเก็บเงินปลายทาง จะแสดงในกล่องด้านบน',
        ],
      },
      {
        key: 'photos',
        title: 'รูปถ่ายลังสินค้า',
        body: [
          'รูปตอนแพ็คของ และรูปตอนส่งลังขึ้นเรือ',
          'แตะรูปเพื่อดูรูปใหญ่ และปัดเพื่อเลื่อนดูรูปถัดไป',
        ],
      },
      {
        key: 'claim',
        title: 'แจ้งปัญหา',
        body: [
          'ของขาด เสียหาย หรือไข่แตก? กด “แจ้งปัญหา” ได้ภายใน 48 ชั่วโมงหลังของออกเรือ',
          'เลือกประเภทปัญหา ติ๊กสินค้าและจำนวน เขียนรายละเอียดสั้นๆ แนบรูป แล้วกดส่งเรื่อง',
          'ไข่แตกนับเป็นฟอง และต้องแนบรูปอย่างน้อย 1 รูป',
          'เรื่องที่แจ้งและสถานะการตรวจสอบจะแสดงในหน้าเดียวกัน',
        ],
      },
      {
        key: 'foam',
        title: 'ลังโฟม',
        body: [
          'ของสดแพ็คในลังโฟมของแม็คโคร แถบสีแดงจะบอกว่าคุณมีลังค้างอยู่กี่ใบ',
          'รบกวนคืนลังเปล่ากับเรือรอบถัดไปที่มาส่งของ',
        ],
      },
      {
        key: 'expiry',
        title: 'ลิงก์ใช้ได้นานแค่ไหน',
        body: [
          'ลิงก์เปิดได้จนถึง 48 ชั่วโมงหลังของส่งขึ้นเรือ',
          'ออเดอร์รับเองที่สาขา จะขึ้นว่า “รับสินค้าที่สาขาแล้ว” เมื่อรับของแล้ว',
        ],
      },
    ],
    footer: 'สงสัยเพิ่มเติม ทักถามในไลน์กลุ่มท่าเรือได้เลย',
  },
}
