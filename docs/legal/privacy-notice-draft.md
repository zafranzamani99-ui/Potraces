# Potraces — Privacy Notice (Notis Privasi)

> **DRAFT — NOT LEGAL ADVICE.** This is an engineering-prepared starting draft for
> counsel / a PDPA consultant to review and finalise before publication. It has not been
> reviewed by a Malaysian lawyer. Bracketed `[…]` items are placeholders you must fill in
> (contact details, DPO, company name, hosting regions, effective date) before publishing.
> Do not rely on this document as a compliant notice until counsel has signed off.
>
> Prepared under: Personal Data Protection Act 2010 (as amended by the Personal Data
> Protection (Amendment) Act 2024), and read together with the PDP Cross-Border Personal
> Data Transfer Guidelines (2025).

**Effective date:** `[DD Month YYYY]`
**Operator / data controller:** `[Registered company name, SSM no., registered address]` ("Potraces", "we", "us")
**Contact / data-subject requests:** `[privacy@potraces.app — placeholder]`
**Data Protection Officer (when appointed):** `[name / role / email — placeholder; see "Data Protection Officer" below]`

---

# ENGLISH

## 1. What this notice covers

Potraces is a Malaysian app that helps you track your own money (personal mode) and run a
small business such as a stall or online seller (business mode). This notice explains what
personal data we collect, why, who processes it on our behalf, where it goes (including
outside Malaysia), how long we keep it, your rights, and how to reach us. It applies to the
Potraces mobile app, the seller order-link web page, and our backend services.

Most of your financial records live **on your device first**. Some features send data to our
cloud and to third-party service providers — those are listed below.

## 2. The personal data we collect

**You give us, or the app records:**

- **Account & identity:** phone number, password (stored hashed by our auth provider), and a
  one-time code we send via Telegram to verify your phone (business mode sign-in).
- **Financial records you enter or import:** transactions (amount, category, description,
  date), wallets/accounts and balances, budgets, savings and investment entries (including a
  rate you enter), goals, recurring subscriptions, and receipts you photograph or upload.
  This is **financial data about you and your money habits** and we treat it as sensitive.
- **Debts, splits and "who owes whom":** amounts you record as owed by or to other people.
- **Imported contacts (data about other people):** if you choose to add a person to a debt,
  split, or customer record, you may import their **name, phone number, and email** from your
  phone contacts or type them in. See section 7 — this is data about **third parties**.
- **Business / seller data:** your shop name, shop link (slug), products, prices, orders,
  customers, seasons, and the contents of your order-link storefront page.
- **Free-text notes you write** (including "Manglish" notes), which an AI feature can read to
  suggest a structured entry (see section 6).
- **Payment-related data:** when you use DuitNow QR or card acceptance, the **money does not
  pass through Potraces** — it flows directly between the payer's bank/card and the seller's
  bank or our licensed payment partner. We record an order reference, amount, and
  paid/pending status. We do **not** store full card numbers.

**Collected automatically:**

- **Device & technical data:** a device push token (to send you notifications), app version,
  basic crash/diagnostic data, and a session identifier.
- We do **not** collect your precise location, and we do not sell your data.

## 3. Why we use it (purposes)

- To provide the core app: record and display your money, wallets, budgets, goals, debts,
  splits, savings, and seller orders/customers.
- To sync your data across your devices and back it up — **only if you turn on Cloud Sync**
  (it is **off by default**).
- To verify your identity for business sign-in (the Telegram one-time code).
- To run the seller order-link storefront so customers can place orders.
- To power optional AI features that turn your notes into suggested entries (section 6).
- To send notifications you've enabled (e.g. reminders), and operational messages.
- To handle DuitNow QR / card payment status, support, fraud prevention, and to keep the
  service secure and working.
- To comply with law, tax, and accounting obligations, and to handle disputes.

We rely on **your consent** for cloud sync, contact import, AI processing, and notifications,
and on our legitimate operation of the service for core local functionality. You can withdraw
consent at any time (section 9).

## 4. Who processes your data (our service providers / processors)

We use the following third parties to run Potraces. They process data **on our behalf** under
their data-processing terms. **Several are located outside Malaysia**, so using these features
involves a **cross-border transfer** of your personal data (section 5).

| Provider | What it does for us | Data it may handle | Location |
|---|---|---|---|
| **Supabase** | Cloud database, authentication, file/receipt storage | Account, financial records, synced contacts/debts, receipts, seller data | Outside Malaysia `[confirm region]` |
| **Anthropic (Claude AI)** | Powers AI parsing & Money Chat answers | Your note / receipt-OCR / order text, your question, and a financial summary you submit | United States / Anthropic |
| **Google (Gemini AI)** | Turns your free-text notes into suggested structured entries | The note text and limited financial context you submit | United States / Google global |
| **Telegram** | Delivers the one-time verification code | Your phone number and the code | Outside Malaysia |
| **Stripe** | Card acceptance (Tap to Pay) for sellers | Payment/card data handled by Stripe (PCI-compliant); we don't store card numbers | United States / global |
| **Expo (EAS) push** | Delivers push notifications | Device push token, notification content | United States |
| **Vercel** | Hosts the seller order-link web page | Order-page content, order data shown to customers | United States / global |

We require each provider to protect your data and to process it only for these purposes. We
maintain (or are putting in place) the required data-processing agreements and transfer
safeguards for these providers.

## 5. Sending data outside Malaysia (cross-border transfer)

Because the providers in section 4 are located outside Malaysia, turning on the relevant
features transfers your personal data abroad. We do this only where permitted under the PDPA
and the 2025 Cross-Border Transfer Guidelines — i.e. where the destination provides
comparable protection, or under contractual safeguards (such as standard contractual
clauses) with the provider, supported by a transfer assessment. We keep records of these
transfers. If you do not want cross-border processing, you can avoid it by **not enabling
Cloud Sync, AI features, or business sign-in**, and by keeping contacts on your device.

## 6. AI features (Anthropic Claude & Google Gemini)

If you use the optional AI features (note-to-entry, receipt/order parsing, Money Chat), the
text you submit and limited context (such as your category and wallet names, or a summary of
your finances when you ask Money Chat a question) are sent to **Anthropic (Claude)** and/or
**Google (Gemini)** to suggest a structured entry or answer your question.
We aim to minimise what is sent and avoid sending more personal data than needed. The AI
provides **general assistance only** — it does **not** provide financial, investment, tax, or
legal advice, and any savings/investment figures shown are estimates, not promises. You can
choose not to use AI features.

## 7. Other people's data you add (third-party contacts)

When you add another person to a debt, split, or customer record, you may store their **name,
phone, and email**. If you turn on Cloud Sync, that information is synced to our cloud. By
adding someone, **you confirm you have a proper basis to record their details** (for example,
they are someone you genuinely transact with). We do **not** use these numbers to market to
those people or to send them invitations. If a person whose details are in Potraces asks us to
remove their data, contact us (section 11) and we will help locate and delete it. Where you can,
prefer keeping contact details on your device rather than syncing them.

## 8. How long we keep your data (retention)

- **On your device:** your records stay until you delete them or uninstall the app.
- **Local rolling backups:** kept on your device for a short rolling window `[~5 days]`, then
  overwritten.
- **In the cloud (if Cloud Sync is on):** kept while your account is active. When you delete
  your account or disable sync with the "wipe cloud data" option, we delete your cloud records.
- **Verification codes:** short-lived; **card data:** held by Stripe, not by us.
- We keep limited records longer only where law (e.g. tax/accounting) requires.

## 9. Your rights

Under the PDPA you can:

- **Access** a copy of the personal data we hold about you.
- **Correct** data that is wrong or incomplete (you can edit most data directly in the app).
- **Delete** your data and account (in-app account deletion is available; this purges cloud
  records and local backups).
- **Port** your data — export it (e.g. CSV) so you can move it elsewhere.
- **Withdraw consent** at any time (turn off Cloud Sync, AI, notifications, or contact import)
  — note some features won't work without the related processing.
- **Object** to or limit certain processing, and **stop direct marketing**.

To exercise any right, contact us (section 11). We will respond within the period required by
law. There is no fee for reasonable requests.

## 10. How we protect your data, and breaches

We take practical steps to protect your data, including access controls on our database,
encryption in transit, hashed passwords (via our auth provider), and bounded local backups.
No system is perfectly secure. **If a personal-data breach occurs**, we will assess it and,
where the law requires, notify the Personal Data Protection Commissioner **within 72 hours**
and notify affected users **without undue delay (within 7 days where significant harm is
likely)**, along with steps you can take.

## 11. Children

Potraces is intended for users **aged 18 and above** and is not directed at children. We do
not knowingly collect data from children. If you believe a child has provided us data, contact
us and we will delete it.

## 12. Data Protection Officer

`[We will appoint and register a Data Protection Officer as required as we grow. Once
appointed, the DPO's contact details will be listed here.]`

## 13. Changes to this notice

We may update this notice. We will post the new version in the app / on our site and update the
effective date. Significant changes will be highlighted.

## 14. How to contact us

For privacy questions, data-subject requests, or complaints:
`[Potraces — privacy@potraces.app — registered address — placeholder]`.
You may also complain to the **Personal Data Protection Department (JPDP), Malaysia**.

---

# BAHASA MALAYSIA

> **DRAF — BUKAN NASIHAT GUAMAN.** Ini draf permulaan yang disediakan oleh pasukan
> kejuruteraan untuk disemak dan dimuktamadkan oleh peguam / perunding PDPA sebelum
> diterbitkan. Ia belum disemak oleh peguam di Malaysia. Item dalam kurungan `[…]` adalah
> ruang isian (butiran hubungan, DPO, nama syarikat, kawasan pelayan, tarikh berkuat kuasa)
> yang mesti diisi sebelum diterbitkan. Jangan bergantung pada dokumen ini sebagai notis yang
> mematuhi undang-undang sehingga peguam meluluskannya.
>
> Disediakan di bawah: Akta Perlindungan Data Peribadi 2010 (sebagaimana dipinda oleh Akta
> Perlindungan Data Peribadi (Pindaan) 2024), dibaca bersama Garis Panduan Pemindahan Data
> Peribadi Merentas Sempadan (2025).

**Tarikh berkuat kuasa:** `[DD Bulan YYYY]`
**Pengendali / pengawal data:** `[Nama syarikat berdaftar, no. SSM, alamat berdaftar]` ("Potraces", "kami")
**Hubungan / permintaan subjek data:** `[privasi@potraces.app — ruang isian]`
**Pegawai Perlindungan Data (apabila dilantik):** `[nama / jawatan / e-mel — ruang isian; lihat "Pegawai Perlindungan Data" di bawah]`

## 1. Apa yang diliputi notis ini

Potraces ialah aplikasi Malaysia yang membantu anda menjejaki wang sendiri (mod peribadi) dan
menjalankan perniagaan kecil seperti gerai atau penjual dalam talian (mod perniagaan). Notis
ini menerangkan data peribadi yang kami kumpul, sebabnya, siapa yang memprosesnya bagi pihak
kami, ke mana ia pergi (termasuk ke luar Malaysia), berapa lama kami menyimpannya, hak anda,
dan cara menghubungi kami. Ia terpakai kepada aplikasi mudah alih Potraces, halaman web pautan
pesanan penjual, dan perkhidmatan backend kami.

Kebanyakan rekod kewangan anda berada **di peranti anda dahulu**. Sesetengah ciri menghantar
data ke awan kami dan kepada pembekal perkhidmatan pihak ketiga — yang disenaraikan di bawah.

## 2. Data peribadi yang kami kumpul

**Anda berikan, atau aplikasi rekodkan:**

- **Akaun & identiti:** nombor telefon, kata laluan (disimpan dalam bentuk hash oleh pembekal
  pengesahan kami), dan kod sekali guna yang kami hantar melalui Telegram untuk mengesahkan
  nombor telefon anda (log masuk mod perniagaan).
- **Rekod kewangan yang anda masukkan atau import:** transaksi (jumlah, kategori, keterangan,
  tarikh), dompet/akaun dan baki, bajet, simpanan dan pelaburan (termasuk kadar yang anda
  masukkan), matlamat, langganan berulang, dan resit yang anda foto atau muat naik. Ini ialah
  **data kewangan tentang anda dan tabiat wang anda** dan kami menganggapnya sensitif.
- **Hutang, pecahan kos dan "siapa berhutang dengan siapa":** jumlah yang anda rekod sebagai
  terhutang oleh atau kepada orang lain.
- **Kenalan yang diimport (data tentang orang lain):** jika anda memilih untuk menambah
  seseorang ke dalam rekod hutang, pecahan, atau pelanggan, anda boleh mengimport **nama,
  nombor telefon, dan e-mel** mereka daripada kenalan telefon anda atau menaipkannya. Lihat
  seksyen 7 — ini ialah data tentang **pihak ketiga**.
- **Data perniagaan / penjual:** nama kedai, pautan kedai (slug), produk, harga, pesanan,
  pelanggan, musim, dan kandungan halaman storefront pautan pesanan anda.
- **Nota teks bebas yang anda tulis** (termasuk nota "Manglish"), yang boleh dibaca oleh ciri
  AI untuk mencadangkan entri berstruktur (lihat seksyen 6).
- **Data berkaitan pembayaran:** apabila anda menggunakan DuitNow QR atau penerimaan kad,
  **wang tidak melalui Potraces** — ia mengalir terus antara bank/kad pembayar dan bank
  penjual atau rakan pembayaran berlesen kami. Kami merekod rujukan pesanan, jumlah, dan status
  bayar/menunggu. Kami **tidak** menyimpan nombor kad penuh.

**Dikumpul secara automatik:**

- **Data peranti & teknikal:** token tolak peranti (untuk menghantar notifikasi), versi
  aplikasi, data ranap/diagnostik asas, dan pengecam sesi.
- Kami **tidak** mengumpul lokasi tepat anda, dan kami tidak menjual data anda.

## 3. Sebab kami menggunakannya (tujuan)

- Menyediakan fungsi teras aplikasi: merekod dan memaparkan wang, dompet, bajet, matlamat,
  hutang, pecahan, simpanan, dan pesanan/pelanggan penjual anda.
- Menyegerak data anda merentas peranti dan membuat sandaran — **hanya jika anda menghidupkan
  Penyegerakan Awan** (ia **dimatikan secara lalai**).
- Mengesahkan identiti anda untuk log masuk perniagaan (kod sekali guna Telegram).
- Menjalankan storefront pautan pesanan penjual supaya pelanggan boleh membuat pesanan.
- Menjalankan ciri AI pilihan yang menukar nota anda kepada cadangan entri (seksyen 6).
- Menghantar notifikasi yang anda dayakan (cth. peringatan), dan mesej operasi.
- Mengendalikan status pembayaran DuitNow QR / kad, sokongan, pencegahan penipuan, dan
  memastikan perkhidmatan selamat dan berfungsi.
- Mematuhi undang-undang, cukai, dan kewajipan perakaunan, serta mengendalikan pertikaian.

Kami bergantung pada **persetujuan anda** untuk penyegerakan awan, import kenalan, pemprosesan
AI, dan notifikasi, dan pada operasi sah perkhidmatan untuk fungsi tempatan teras. Anda boleh
menarik balik persetujuan pada bila-bila masa (seksyen 9).

## 4. Siapa yang memproses data anda (pembekal perkhidmatan / pemproses kami)

Kami menggunakan pihak ketiga berikut untuk menjalankan Potraces. Mereka memproses data **bagi
pihak kami** di bawah terma pemprosesan data mereka. **Beberapa berada di luar Malaysia**,
jadi menggunakan ciri ini melibatkan **pemindahan merentas sempadan** data peribadi anda
(seksyen 5).

| Pembekal | Fungsinya untuk kami | Data yang mungkin dikendalikan | Lokasi |
|---|---|---|---|
| **Supabase** | Pangkalan data awan, pengesahan, storan fail/resit | Akaun, rekod kewangan, kenalan/hutang yang disegerak, resit, data penjual | Luar Malaysia `[sahkan kawasan]` |
| **Anthropic (Claude AI)** | Menggerakkan penghuraian AI & jawapan Money Chat | Teks nota / OCR resit / pesanan, soalan anda, dan ringkasan kewangan yang anda serahkan | Amerika Syarikat / Anthropic |
| **Google (Gemini AI)** | Menukar nota teks bebas anda kepada cadangan entri berstruktur | Teks nota dan konteks kewangan terhad yang anda serahkan | Amerika Syarikat / global Google |
| **Telegram** | Menghantar kod pengesahan sekali guna | Nombor telefon anda dan kod | Luar Malaysia |
| **Stripe** | Penerimaan kad (Tap to Pay) untuk penjual | Data pembayaran/kad dikendalikan Stripe (mematuhi PCI); kami tidak simpan nombor kad | Amerika Syarikat / global |
| **Expo (EAS) push** | Menghantar notifikasi tolak | Token tolak peranti, kandungan notifikasi | Amerika Syarikat |
| **Vercel** | Menghoskan halaman web pautan pesanan penjual | Kandungan halaman pesanan, data pesanan yang dipaparkan kepada pelanggan | Amerika Syarikat / global |

Kami menghendaki setiap pembekal melindungi data anda dan memprosesnya hanya untuk tujuan ini.
Kami menyelenggara (atau sedang melaksanakan) perjanjian pemprosesan data dan langkah
perlindungan pemindahan yang diperlukan untuk pembekal ini.

## 5. Menghantar data ke luar Malaysia (pemindahan merentas sempadan)

Oleh kerana pembekal dalam seksyen 4 berada di luar Malaysia, menghidupkan ciri berkaitan akan
memindahkan data peribadi anda ke luar negara. Kami berbuat demikian hanya jika dibenarkan di
bawah PDPA dan Garis Panduan Pemindahan Merentas Sempadan 2025 — iaitu apabila destinasi
memberi perlindungan setara, atau di bawah langkah perlindungan kontraktual (seperti klausa
kontrak standard) dengan pembekal, disokong oleh penilaian pemindahan. Kami menyimpan rekod
pemindahan ini. Jika anda tidak mahu pemprosesan merentas sempadan, anda boleh mengelaknya
dengan **tidak mendayakan Penyegerakan Awan, ciri AI, atau log masuk perniagaan**, dan dengan
menyimpan kenalan di peranti anda.

## 6. Ciri AI (Anthropic Claude & Google Gemini)

Jika anda menggunakan ciri AI pilihan (nota-ke-entri, penghuraian resit/pesanan, Money Chat),
teks yang anda serahkan dan konteks terhad (seperti nama kategori dan dompet, atau ringkasan
kewangan anda apabila bertanya Money Chat) dihantar ke **Anthropic (Claude)** dan/atau
**Google (Gemini)** untuk mencadangkan entri berstruktur atau menjawab soalan anda. Kami
berusaha mengurangkan apa yang dihantar dan mengelak menghantar data peribadi melebihi
keperluan. AI memberi **bantuan umum sahaja** — ia **tidak** memberi nasihat kewangan,
pelaburan, cukai, atau guaman, dan sebarang angka simpanan/pelaburan yang dipaparkan ialah
anggaran, bukan janji. Anda boleh memilih untuk tidak menggunakan ciri AI.

## 7. Data orang lain yang anda tambah (kenalan pihak ketiga)

Apabila anda menambah orang lain ke dalam rekod hutang, pecahan, atau pelanggan, anda mungkin
menyimpan **nama, telefon, dan e-mel** mereka. Jika anda menghidupkan Penyegerakan Awan,
maklumat itu disegerak ke awan kami. Dengan menambah seseorang, **anda mengesahkan bahawa anda
mempunyai asas yang wajar untuk merekod butiran mereka** (contohnya, mereka ialah orang yang
benar-benar berurus niaga dengan anda). Kami **tidak** menggunakan nombor ini untuk memasarkan
kepada mereka atau menghantar jemputan. Jika seseorang yang butirannya ada dalam Potraces minta
kami membuangnya, hubungi kami (seksyen 11) dan kami akan membantu mencari dan memadamkannya.
Jika boleh, lebih baik simpan butiran kenalan di peranti anda daripada menyegerakkannya.

## 8. Berapa lama kami menyimpan data anda (pengekalan)

- **Di peranti anda:** rekod anda kekal sehingga anda memadamkannya atau menyahpasang aplikasi.
- **Sandaran tempatan berulang:** disimpan di peranti anda untuk tempoh berulang yang singkat
  `[~5 hari]`, kemudian ditulis ganti.
- **Di awan (jika Penyegerakan Awan dihidupkan):** disimpan selagi akaun anda aktif. Apabila
  anda memadamkan akaun atau mematikan penyegerakan dengan pilihan "padam data awan", kami
  memadamkan rekod awan anda.
- **Kod pengesahan:** singkat tempoh hayat; **data kad:** dipegang oleh Stripe, bukan kami.
- Kami menyimpan rekod terhad lebih lama hanya jika undang-undang (cth. cukai/perakaunan)
  memerlukan.

## 9. Hak anda

Di bawah PDPA anda boleh:

- **Akses** salinan data peribadi yang kami simpan tentang anda.
- **Betulkan** data yang salah atau tidak lengkap (anda boleh mengedit kebanyakan data terus
  dalam aplikasi).
- **Padam** data dan akaun anda (pemadaman akaun dalam aplikasi tersedia; ini membersihkan
  rekod awan dan sandaran tempatan).
- **Mudah alih (port)** data anda — eksport (cth. CSV) supaya anda boleh memindahkannya ke
  tempat lain.
- **Tarik balik persetujuan** pada bila-bila masa (matikan Penyegerakan Awan, AI, notifikasi,
  atau import kenalan) — ambil perhatian sesetengah ciri tidak akan berfungsi tanpa pemprosesan
  berkaitan.
- **Bantah** atau hadkan pemprosesan tertentu, dan **hentikan pemasaran langsung**.

Untuk menggunakan mana-mana hak, hubungi kami (seksyen 11). Kami akan membalas dalam tempoh
yang dikehendaki undang-undang. Tiada bayaran untuk permintaan yang munasabah.

## 10. Cara kami melindungi data anda, dan pelanggaran

Kami mengambil langkah praktikal untuk melindungi data anda, termasuk kawalan akses pada
pangkalan data kami, penyulitan semasa penghantaran, kata laluan hash (melalui pembekal
pengesahan kami), dan sandaran tempatan yang terhad. Tiada sistem yang selamat sepenuhnya.
**Jika berlaku pelanggaran data peribadi**, kami akan menilainya dan, jika undang-undang
memerlukan, memberitahu Pesuruhjaya Perlindungan Data Peribadi **dalam masa 72 jam** dan
memberitahu pengguna yang terjejas **tanpa lengah (dalam masa 7 hari jika kemudaratan ketara
berkemungkinan)**, berserta langkah yang boleh anda ambil.

## 11. Kanak-kanak

Potraces ditujukan untuk pengguna **berumur 18 tahun dan ke atas** dan bukan untuk kanak-kanak.
Kami tidak mengumpul data kanak-kanak dengan sengaja. Jika anda percaya seorang kanak-kanak
telah memberi kami data, hubungi kami dan kami akan memadamkannya.

## 12. Pegawai Perlindungan Data

`[Kami akan melantik dan mendaftarkan Pegawai Perlindungan Data sebagaimana yang dikehendaki
apabila kami berkembang. Setelah dilantik, butiran hubungan DPO akan disenaraikan di sini.]`

## 13. Perubahan kepada notis ini

Kami mungkin mengemas kini notis ini. Kami akan menyiarkan versi baharu dalam aplikasi / di
laman kami dan mengemas kini tarikh berkuat kuasa. Perubahan penting akan diketengahkan.

## 14. Cara menghubungi kami

Untuk soalan privasi, permintaan subjek data, atau aduan:
`[Potraces — privasi@potraces.app — alamat berdaftar — ruang isian]`.
Anda juga boleh membuat aduan kepada **Jabatan Perlindungan Data Peribadi (JPDP), Malaysia**.

---

*End of draft. Mirror any edits across BOTH the English and Bahasa Malaysia sections to keep
full parity (required by the PDPA bilingual-notice rule). Have counsel verify the
cross-border, retention, breach-timeline, DPO-threshold, and minimum-age statements before
publishing.*
