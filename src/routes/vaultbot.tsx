import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import luxuryBackground from "@/assets/vaultbot-luxury.asset.json";
import { askVaultBot } from "@/lib/vaultbot.functions";
import { getSlots, getMine, requestOtp, verifyOtp, bookSlot, payDeposit, cancelBooking, requestHuman, sendBookingOtp, editBooking } from "@/lib/bookings.functions";

export const Route = createFileRoute("/vaultbot")({
  head: () => ({
    meta: [
      { title: "The Beauty Vault — VaultBot Beauty Concierge" },
      { name: "description", content: "Chat with VaultBot to explore services and book salon appointments in Cape Town, Johannesburg and Durban." },
      { property: "og:title", content: "The Beauty Vault — VaultBot" },
      { property: "og:description", content: "Your Beauty. Your Time. Your Vault." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const SERVICES: Record<string, string[]> = {
  "Beauty Studio": ["Hair styling — R450", "Braiding — R650", "Gel nails — R320", "Eyelash extensions — R550", "Eyebrow lamination — R380"],
  "Wellness Clinic": ["Pedicure — R300", "Facial — R520", "Massage (60 min) — R600", "Body wrap — R480", "Waxing — from R150"],
  "Grooming Lounge": ["Men's haircut — R180", "Fade — R220", "Beard trim — R120", "Dreadlock maintenance — R400"],
  "Beauty Boutique": ["Human-hair wigs", "Hair care products", "Nail care kits", "Skincare"],
};
const PACKAGES = ["Bridal Glow — R1,800 (hair, makeup, nails)", "Vault Pamper Day — R1,400 (facial, massage, pedicure)", "Gentleman's Reset — R550 (cut, beard, facial)"];
const BRANCHES = ["Cape Town", "Johannesburg", "Durban"];
const TIMES = ["09:00", "10:30", "12:00", "14:00", "15:30"];

type Msg = { from: "bot" | "me"; text: string; chips?: string[] };
type Booking = { id: string; service: string; branch: string; date: string; time: string; name: string; phone: string; paid: boolean };
type Draft = Partial<Booking> & { step?: string; otp?: string; target?: string; after?: string };

const ALL = [...PACKAGES.map((p) => p.split(" — ")[0]!), ...Object.entries(SERVICES).filter(([k]) => k !== "Beauty Boutique").flatMap(([, v]) => v.map((s) => s.split(" — ")[0]!))];
const DUR: Record<string, string> = { "Hair styling": "60 min", Braiding: "3 h", "Gel nails": "60 min", "Eyelash extensions": "90 min", "Eyebrow lamination": "45 min", Pedicure: "45 min", Facial: "60 min", "Massage (60 min)": "60 min", "Body wrap": "75 min", Waxing: "30 min", "Men's haircut": "30 min", Fade: "40 min", "Beard trim": "20 min", "Dreadlock maintenance": "2 h", "Bridal Glow": "4 h", "Vault Pamper Day": "3 h", "Gentleman's Reset": "90 min" };
const DIVS: Record<string, string[]> = { ...Object.fromEntries(Object.entries(SERVICES).filter(([k]) => k !== "Beauty Boutique")), "Signature Packages": PACKAGES };
const DAYS = ["Today", "Tomorrow", "Saturday"];
const FAQ: [string, string][] = [
  ["late", "Arriving 15+ minutes late may shorten or reschedule your treatment."],
  ["refund", "Deposits are refundable if you cancel at least 24 hours before."],
  ["park", "Free parking is available at all three branches."],
  ["loyal", "Earn 1 Vault point per R10 spent (simulated); 500 points = R50 off."],
  ["product", "Boutique: human-hair wigs from R1,200, hair care from R150, nail kits R250, skincare from R180."],
];
let cache: { id: string; branch: string; date: string; time: string }[] = [];
const load = () => cache;
const refresh = async () => { try { cache = await getSlots(); } catch { /* keep last */ } };
// Internal demo staff rosters (not shown to customers): who works where, which days.
const STAFF: Record<string, { name: string; days: string[] }[]> = {
  "Cape Town": [{ name: "Ayesha", days: ["Today", "Tomorrow", "Saturday"] }, { name: "Liam", days: ["Today", "Saturday"] }],
  Johannesburg: [{ name: "Thandi", days: ["Today", "Tomorrow", "Saturday"] }, { name: "Sipho", days: ["Tomorrow"] }],
  Durban: [{ name: "Priya", days: ["Today", "Tomorrow"] }, { name: "Nomsa", days: ["Tomorrow", "Saturday"] }],
};
const dayTimes = (date?: string) => (date === "Saturday" ? TIMES.slice(0, 3) : TIMES);
const capacity = (d: Partial<Booking>) => (STAFF[d.branch ?? ""] ?? []).filter((x) => x.days.includes(d.date ?? "")).length;
const taken = (d: Partial<Booking>, skip?: string) => {
  const cap = capacity(d);
  const used = load().filter((b) => b.id !== skip && b.branch === d.branch && b.date === d.date).map((b) => b.time);
  return dayTimes(d.date).filter((t) => cap === 0 || used.filter((u) => u === t).length >= cap);
};
let session = "";
const WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
// Reads a typed request like "book me a facial on Friday in Durban".
function parseRequest(l: string, now = new Date()) {
  const service = [...ALL].sort((a, b) => b.length - a.length).find((x) => l.includes(x.toLowerCase().replace(/ \(.*\)/, ""))) ?? (l.includes("nails") ? "Gel nails" : l.includes("haircut") ? "Men's haircut" : l.includes("massage") ? "Massage (60 min)" : undefined);
  const branch = BRANCHES.find((b) => l.includes(b.toLowerCase())) ?? (l.includes("joburg") || l.includes("jhb") ? "Johannesburg" : l.includes("cpt") ? "Cape Town" : undefined);
  const today = new Date(now.getTime() + 2 * 3600000).getUTCDay();
  let date: string | undefined; let dayNote: string | undefined;
  if (l.includes("tomorrow")) date = "Tomorrow"; else if (l.includes("today")) date = "Today";
  else { const w = WEEK.findIndex((x) => l.includes(x)); if (w >= 0) {
    if (w === today) date = "Today"; else if (w === (today + 1) % 7) date = "Tomorrow"; else if (w === 6) date = "Saturday";
    else dayNote = `I can currently book Today, Tomorrow or this Saturday — ${WEEK[w]![0]!.toUpperCase() + WEEK[w]!.slice(1)} isn't open for bookings yet.`;
  } }
  return { service, branch, date, dayNote };
}
const MENU_DESC: Record<string, string> = { "Book an appointment": "Choose your branch, service, date and time using dropdowns.", "Manage my appointment": "Edit or reschedule an appointment.", "My bookings": "View your existing bookings.", "View services": "Explore our beauty services.", "Packages": "Discover our signature packages.", "FAQs": "Find answers to common questions.", "Talk to a human": "Connect with customer support." };
const MENU = ["Book an appointment", "Manage my appointment", "My bookings", "View services", "Packages", "FAQs", "Talk to a human"];

function Index() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: "bot", text: "Welcome to The Beauty Vault ✨ I'm VaultBot, your beauty concierge. (Demo business data; payments and SMS are simulated.)", chips: MENU },
  ]);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<Draft>({});
  const [form, setForm] = useState(true);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [pending, setPending] = useState<(Booking & { cap: number }) | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (msgs.length > 1) end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs]);

  const bot = (text: string, chips?: string[]) => setMsgs((m) => [...m, { from: "bot", text, ...(chips ? { chips } : {}) }]);
  const pick = (t: string, opts: string[]) => opts.find((o) => o.toLowerCase() === t.toLowerCase());

  async function listMine(phone: string) {
    const mine = (await getMine({ data: { token: session } })) as Booking[];
    setDraft({ phone, step: "manage" });
    if (!mine.length) return bot("No bookings found for this number.", MENU);
    bot(`⭐ Vault loyalty (simulated): ${mine.length * 50 + mine.filter((b) => b.paid).length * 10} points — 500 points = R50 off.`);
    bot(mine.map((b) => `Ref ${b.id} · ${b.name}\n${b.service} — ${b.branch}, ${b.date} (${visitDateLabel(b.date)}) ${b.time}\nStatus: Confirmed · R100 deposit ${b.paid ? "paid" : "due"}`).join("\n\n"),
      mine.flatMap((b) => [`Edit #${b.id}`, `Cancel #${b.id}`, `Reschedule #${b.id}`]).concat("Menu"));
  }

  function handle(raw: string) {
    const t = raw.trim();
    if (!t) return;
    setMsgs((m) => [...m, { from: "me", text: t }]);
    setInput("");
    const l = t.toLowerCase();
    const d: Draft = { ...draft };
    setTimeout(async () => { try {
      await refresh();
      if (l === "book an appointment" || l === "book with dropdowns") { setForm(true); return bot("Fill in the booking form below 👇"); }
      if (l === "menu") { setDraft({}); return bot("How else can I help?", MENU); }
      switch (d.step) {
        case "division": {
          const v = pick(t, Object.keys(DIVS)); if (!v) return bot("Please choose a division.", Object.keys(DIVS));
          setDraft({ step: "service" });
          return bot(`${v}:\n` + DIVS[v]!.map((x) => `• ${x} · ${DUR[x.split(" — ")[0]!] ?? "60 min"}`).join("\n") + "\nWhich would you like?", DIVS[v]!.map((x) => x.split(" — ")[0]!));
        }
        case "service": { const v = pick(t, ALL); if (!v) return bot("Please choose a listed service.", ALL); setDraft({ ...d, service: v, step: "branch" }); return bot("Which branch?", BRANCHES); }
        case "branch": { const v = pick(t, BRANCHES); if (!v) return bot("Please choose a branch.", BRANCHES); if (d.date) { const free = dayTimes(d.date).filter((x) => !taken({ ...d, branch: v }).includes(x)); if (free.length) { setDraft({ ...d, branch: v, step: "time" }); return bot(`Available at ${v} on ${d.date}:`, free); } } setDraft({ ...d, branch: v, step: "date" }); return bot("Which day?", DAYS); }
        case "date": {
          const v = pick(t, DAYS); if (!v) return bot("Please choose a day.", DAYS);
          const free = dayTimes(v).filter((x) => !taken({ ...d, date: v }, d.target).includes(x));
          if (!free.length) return bot("That day is fully booked. Try another.", DAYS);
          setDraft({ ...d, date: v, step: "time" }); return bot(`Available at ${d.branch} on ${v}:`, free);
        }
        case "time": {
          const free = dayTimes(d.date).filter((x) => !taken(d, d.target).includes(x)); const v = pick(t, free);
          if (!v) return bot("That time isn't available.", free);
          if (d.target) { const r = await bookSlot({ data: { id: d.target, service: d.service!, branch: d.branch!, date: d.date!, time: v, name: d.name!, phone: d.phone!, cap: capacity(d), skip: d.target, token: session } }); if (!r.ok) return bot("That time was just taken. Pick another.", free.filter((x) => x !== v)); bot(`Rescheduled ✅ #${d.target} is now ${d.date} ${v}.\n${r.msg}`); return listMine(d.phone!); }
          setDraft({ ...d, time: v, step: "name" }); return bot("What name should I book under?");
        }
        case "name": if (t.length < 2) return bot("Please enter your name."); setDraft({ ...d, name: t, step: "phone" }); return bot("Your SA mobile number (e.g. 0821234567)?");
        case "h_reason": setDraft({ step: "h_contact", name: t }); return bot("Your SA mobile number so a consultant can call you back?");
        case "h_contact": {
          const hr = await requestHuman({ data: { reason: d.name!, contact: t.replace(/\s/g, "") } });
          if (!hr.ok) return bot("Please enter a valid SA mobile number, e.g. 0821234567.");
          setDraft({}); return bot("✅ Request logged. A consultant will call you within 1 business day (simulated). Urgent? Call 021 000 0000 (demo).", MENU);
        }
        case "lookup": {
          const r = await requestOtp({ data: { ref: t } });
          if (!r.ok) return bot(r.reason, MENU);
          setDraft({ step: "otp2", target: t.toUpperCase() });
          return bot(`📱 SIMULATED SMS to ${r.masked}: your Vault code is ${r.code}. It expires in 5 minutes (3 attempts).`);
        }
        case "otp2": {
          const r = await verifyOtp({ data: { ref: d.target!, code: t } });
          if (!r.ok) return bot(r.reason, r.reason.startsWith("Incorrect") ? undefined : MENU);
          session = r.token; return listMine("");
        }
        case "phone": {
          const ph = t.replace(/\s/g, ""); if (!/^0[6-8]\d{8}$/.test(ph)) return bot("Please enter a valid SA mobile number, e.g. 0821234567.");
          setDraft({ ...d, phone: ph, step: "review" });
          return bot(`Please review:\n• ${d.service}\n• ${d.branch}, ${d.date} at ${d.time}\n• ${d.name}, ${ph}\nDeposit: R100`, ["Confirm booking", "Menu"]);
        }
        case "review": {
          if (!l.startsWith("confirm")) return bot("Tap Confirm booking or Menu.", ["Confirm booking", "Menu"]);
          const b: Booking = { id: "BV" + String(Date.now()).slice(-5), service: d.service!, branch: d.branch!, date: d.date!, time: d.time!, name: d.name!, phone: d.phone!, paid: false };
          if (d.step === "review" && draft.step !== "review") return;
          setDraft({ step: "saving" });
          const r = await bookSlot({ data: { ...b, cap: capacity(b) } });
          if (r.token) session = r.token;
          if (r.msg) bot(r.msg);
          if (!r.ok) { setDraft({}); return bot("Sorry, that slot was just taken. Please start again.", ["Book an appointment"]); }
          setDraft({ ...d, id: b.id, step: "pay" });
          return bot(`Booked ✅ Your reference is ${b.id} — keep it to manage your booking.  ${b.service} at ${b.branch}, ${b.date} ${b.time}, for ${b.name}. Pay the R100 deposit now?`, ["Pay deposit (simulated)", "Pay later"]);
        }
        case "pay":
          if (l.startsWith("pay deposit")) { const pr = await payDeposit({ data: { id: d.id!, token: session } }); setDraft({}); bot("💳 Simulated payment successful. Deposit received — see you soon!"); return bot(pr.msg, MENU); }
          setDraft({}); return bot("No problem — the deposit is due 24 hours before your visit.", MENU);
        case "editresend": {
          if (!pending) break;
          const r = await requestOtp({ data: { ref: pending.id } });
          if (!r.ok) return bot(r.reason, ["Send code", "Menu"]);
          setDraft({ step: "editotp" });
          return bot(`📱 SIMULATED SMS to ${r.masked}: your Vault code is ${r.code}. Enter it to save your changes (expires in 5 minutes, 3 attempts).`);
        }
        case "editotp": {
          if (!pending) break;
          const r = await verifyOtp({ data: { ref: pending.id, code: t } });
          if (!r.ok) return bot(r.reason, r.reason.startsWith("Incorrect") ? undefined : MENU);
          session = r.token;
          const er = await editBooking({ data: { ...pending, token: session } });
          if (!er.ok) { setDraft({ step: "manage" }); return bot(er.msg, [`Edit #${pending.id}`, "Menu"]); }
          setPending(null);
          bot(`Your appointment has been successfully updated! Your new booking details are confirmed. Thank you for choosing The Beauty Vault.\n\nRef ${pending.id} · ${pending.name}, ${pending.phone}\n${pending.service} — ${pending.branch}, ${pending.date} at ${pending.time}\n${er.msg}`);
          return listMine("");
        }
        case "manage": {
          const e = t.match(/^edit #(BV\d+)$/i); const eb = e && ((await getMine({ data: { token: session } })) as Booking[]).find((x) => x.id === e[1]);
          if (eb) { setEditing(eb); return bot("Update your appointment below 👇"); }
          const m = t.match(/^(cancel|reschedule) #(BV\d+)$/i); const b = m && ((await getMine({ data: { token: session } })) as Booking[]).find((x) => x.id === m[2]);
          if (!m || !b) break;
          if (m[1]!.toLowerCase() === "cancel") { const cr = await cancelBooking({ data: { id: b.id, token: session } }); bot(`Cancelled #${b.id}.${b.paid ? " Deposit refund simulated." : ""}\n${cr.msg}`); return listMine(d.phone!); }
          setDraft({ ...b, step: "date", target: b.id }); return bot(`New day for ${b.service}?`, DAYS);
        }
      }
      const ref = t.match(/BV\d{5}/i)?.[0]?.toUpperCase();
      if (ref && /cancel|reschedul|move|change|my booking/.test(l)) {
        const r = await requestOtp({ data: { ref } });
        if (!r.ok) return bot(r.reason, MENU);
        setDraft({ step: "otp2", target: ref });
        return bot(`📱 SIMULATED SMS to ${r.masked}: your Vault code is ${r.code}. Enter it to see booking ${ref} and cancel or reschedule it.`);
      }
      const req = parseRequest(l);
      if (req.service || (l.includes("book") && !l.includes("my"))) {
        if (!req.service) { setDraft({ step: "division" }); return bot("Which division?", Object.keys(DIVS)); }
        const nd: Draft = { service: req.service };
        if (req.dayNote) bot(req.dayNote);
        if (!req.branch) { setDraft({ ...nd, ...(req.date ? { date: req.date } : {}), step: "branch" }); return bot(`${req.service}${req.date ? ` on ${req.date}` : ""} — which branch?`, BRANCHES); }
        nd.branch = req.branch;
        if (!req.date) { setDraft({ ...nd, step: "date" }); return bot(`${req.service} at ${req.branch} — which day?`, DAYS); }
        const day = req.date;
        const free = dayTimes(day).filter((x) => !taken({ ...nd, date: day }).includes(x));
        if (!free.length) { setDraft({ ...nd, step: "date" }); return bot(`${day} is fully booked at ${req.branch}. Try another day.`, DAYS); }
        setDraft({ ...nd, date: day, step: "time" }); return bot(`${req.service} at ${req.branch} on ${day}. Available times:`, free);
      }
      if (l.includes("my booking") || l.includes("manage") || l.includes("cancel") || l.includes("reschedul")) { setDraft({ step: "lookup" }); return bot("Please enter your booking reference (e.g. BV12345). I'll send a verification code to the number on the booking."); }
      if (l.includes("service") || l.includes("price")) return bot(Object.entries(SERVICES).map(([k, v]) => `${k}: ${v.join(", ")}`).join("\n\n"), ["Book an appointment"]);
      if (l.includes("package")) return bot("Signature packages:\n" + PACKAGES.map((p) => "• " + p).join("\n"), ["Book an appointment"]);
      if (l.includes("human") || l.includes("agent")) { setDraft({ step: "h_reason" }); return bot("I'll connect you with a consultant. What's the reason?", ["Booking problem", "Payment question", "Complaint", "Product advice"]); }
      if (l.includes("hour") || l.includes("open")) return bot("Mon–Fri 08:00–19:00, Sat 08:00–17:00, Sun 09:00–14:00 at all branches.");
      if (l.includes("deposit") || l.includes("pay")) return bot("A R100 deposit secures your slot (simulated card/EFT); the balance is paid in salon.");
      const f = FAQ.find(([k]) => l.includes(k)); if (f) return bot(f[1], MENU);
      if (l.includes("faq")) return bot(FAQ.map(([, a]) => "• " + a).join("\n"), MENU);
      const hist = [...msgs, { from: "me", text: t }].slice(-12).map((m) => ({ role: m.from === "me" ? ("user" as const) : ("assistant" as const), content: m.text }));
      askVaultBot({ data: { history: hist } })
        .then((r) => bot(r.text || "I can help with bookings, rescheduling, services, packages, products, loyalty, hours and deposits.", MENU))
        .catch(() => bot("I can help with bookings, rescheduling, services, packages, products, loyalty, hours and deposits.", MENU));
    } catch { bot("Sorry, I couldn't reach our booking system. Please try again.", MENU); } }, 300);
  }

  return (
    <main className="vaultbot-page min-h-screen flex flex-col items-center">
      <img src={luxuryBackground.url} alt="" aria-hidden="true" className="vaultbot-backdrop" />
      <header className="vaultbot-brandbar text-center">
        <Link to="/" className="font-display text-xl text-foreground">The Beauty Vault</Link>
        <p className="mt-1 text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Your Beauty. Your Time. Your Vault.</p>
      </header>
      <section className="vaultbot-panel w-full flex flex-col bg-card border border-border overflow-hidden">
        <div className="vaultbot-heading flex flex-col items-center text-center">
          <div className="vaultbot-logo grid place-items-center font-display">V</div>
          <h1 className="mt-2 font-display text-4xl text-foreground">VaultBot</h1>
          <p className="mt-1 text-xs tracking-wide text-muted-foreground">Your Virtual Beauty Concierge</p>
          <div className="vaultbot-gold-rule" aria-hidden="true">✦</div>
        </div>
        {form && <DropdownBooking onClose={() => setForm(false)} onResult={(t) => bot(t, MENU)} />}
        <div className="vaultbot-chat p-5 space-y-4">
          {msgs.map((m, i) => (
            <div key={i} className={m.from === "me" ? "flex justify-end" : ""}>
              <div className={`whitespace-pre-line max-w-[85%] text-sm leading-relaxed ${m.from === "me" ? "bg-foreground text-background rounded-2xl rounded-br-sm px-4 py-2" : "text-foreground"}`}>{m.text}</div>
              {m.chips && i === msgs.length - 1 && m.chips === MENU && (
                <nav className="mt-4 w-full rounded-xl border border-border bg-card divide-y divide-primary/40">
                  {MENU.map((c, n) => (
                    <button key={c} onClick={() => handle(c)} className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-muted transition">
                      <span className="font-display text-lg text-primary w-7 shrink-0">{String(n + 1).padStart(2, "0")}</span>
                      <span className="flex-1 min-w-0"><span className="block font-semibold text-foreground text-sm">{c}</span><span className="block text-xs text-muted-foreground">{MENU_DESC[c]}</span></span>
                      <span aria-hidden className="text-primary text-lg shrink-0">›</span>
                    </button>
                  ))}
                </nav>
              )}
              {m.chips && i === msgs.length - 1 && m.chips !== MENU && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.chips.map((c) => <button key={c} onClick={() => handle(c)} className="text-xs px-3 py-1.5 rounded-full border border-primary text-foreground hover:bg-secondary transition">{c}</button>)}
                </div>
              )}
            </div>
          ))}
          {editing && <EditBooking b={editing} onClose={() => setEditing(null)} onConfirm={async (nb) => {
            setEditing(null);
            setPending(nb);
            const r = await requestOtp({ data: { ref: nb.id } });
            if (!r.ok) { setDraft({ step: "editresend" }); return bot(r.reason, ["Send code", "Menu"]); }
            setDraft({ step: "editotp" });
            bot(`📱 SIMULATED SMS to ${r.masked}: your Vault code is ${r.code}. Enter it to save your changes (expires in 5 minutes, 3 attempts).`);
          }} />}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); handle(input); }} className="p-3 border-t border-border flex gap-2">
          <input aria-label="Message VaultBot" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask VaultBot…" className="min-w-0 flex-1 bg-muted rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <Button type="submit" className="rounded-full px-5">Send</Button>
        </form>
      </section>
      <Link to="/services" className="relative my-5 text-xs text-muted-foreground underline underline-offset-4">Services & packages</Link>
    </main>
  );
}

// Turns a picked calendar date into the day labels the staff roster uses (Today / Tomorrow / Saturday).
const labelFor = (iso: string) => DAYS.find((d) => visitDateLabel(d) === iso);
const visitDateLabel = (label: string) => {
  const d = new Date(Date.now() + 2 * 3600000);
  d.setUTCDate(d.getUTCDate() + (label === "Tomorrow" ? 1 : label === "Saturday" ? (6 - d.getUTCDay() + 7) % 7 : 0));
  return d.toISOString().slice(0, 10);
};
const PRICED = [...PACKAGES.map((p) => p.replace(/ \(.*\)/, "")), ...Object.entries(SERVICES).filter(([k]) => k !== "Beauty Boutique").flatMap(([, v]) => v)];

function DropdownBooking({ onClose, onResult }: { onClose: () => void; onResult: (t: string) => void }) {
  const [f, setF] = useState({ branch: "", service: "", date: "", time: "", name: "", phone: "", email: "" });
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { void refresh().then(() => tick((n) => n + 1)); }, [f.branch, f.date]);
  const label = f.date ? labelFor(f.date) : undefined;
  const free = f.branch && label ? dayTimes(label).filter((x) => !taken({ branch: f.branch, date: label }).includes(x)) : [];
  const set = (k: keyof typeof f, v: string) => { setReview(false); setF((o) => ({ ...o, [k]: v, ...(k === "branch" || k === "date" ? { time: "" } : {}) })); };
  const phone = f.phone.replace(/\s/g, "");
  const complete = f.branch && f.service && f.time && free.includes(f.time) && f.name.trim().length >= 2 && /^0[6-8]\d{8}$/.test(phone) && (!f.email || /^\S+@\S+\.\S+$/.test(f.email));
  const cls = "w-full bg-muted rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
  const today = visitDateLabel("Today");
  async function verify() {
    setBusy(true);
    try { const r = await sendBookingOtp({ data: { phone } }); if (!r.ok) onResult(`⚠️ ${r.reason}`); }
    catch { onResult("Sorry, I couldn't reach the verification service."); }
    setBusy(false);
  }
  const ready = f.branch && f.service && f.time && free.includes(f.time);
  const lbl = "block space-y-1.5 text-sm font-medium text-foreground";
  const fld = "w-full h-11 bg-muted rounded-xl px-4 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";
  return (
    <div className="vaultbot-booking px-5 sm:px-8 pb-6 space-y-4 w-full">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold tracking-[0.2em] text-primary">THE BEAUTY VAULT</p>
        <span className="rounded-full bg-success text-success-foreground text-[11px] px-2.5 py-0.5">Booking preview</span>
      </div>
      <div className="text-center"><h2 className="font-display text-2xl text-foreground">Book your appointment</h2></div>
      <label className={lbl}><span>1. Choose your branch</span><select aria-label="Branch" className={fld} value={f.branch} onChange={(e) => set("branch", e.target.value)}><option value="">Select branch</option>{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select></label>
      <label className={lbl}><span>2. Choose your service</span><select aria-label="Service" className={fld} value={f.service} onChange={(e) => set("service", e.target.value)}><option value="">Select service</option>{PRICED.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label className={lbl}><span>3. Choose appointment date</span><input aria-label="Date" type="date" min={today} max={visitDateLabel("Saturday") > visitDateLabel("Tomorrow") ? visitDateLabel("Saturday") : visitDateLabel("Tomorrow")} className={fld} value={f.date} onChange={(e) => set("date", e.target.value)} /></label>
      {f.date && !label && <p className="text-xs text-muted-foreground">Bookings are open for today, tomorrow and this Saturday only.</p>}
      <label className={lbl}><span>4. Available appointment time</span><select aria-label="Time" className={fld} value={f.time} disabled={!free.length} onChange={(e) => set("time", e.target.value)}><option value="">{f.branch && label && !free.length ? "Fully booked" : "Select available time"}</option>{free.map((t) => <option key={t}>{t}</option>)}</select></label>
      {!review ? (
        <Button disabled={!ready} onClick={() => setReview(true)} className="w-full h-11 rounded-lg disabled:bg-muted disabled:text-muted-foreground">Review booking</Button>
      ) : (
        <div className="space-y-3">
          <div className="bg-secondary rounded-xl p-3 text-sm space-y-0.5">
            <p className="font-medium">Booking review</p>
            <p>{f.branch} · {f.service}</p>
            <p>{f.date} ({label}) at {f.time}</p>
          </div>
          <input aria-label="Full name" placeholder="Full name" className={fld} value={f.name} onChange={(e) => setF((o) => ({ ...o, name: e.target.value }))} />
          <input aria-label="Mobile number" placeholder="SA mobile e.g. 0821234567" className={fld} value={f.phone} onChange={(e) => setF((o) => ({ ...o, phone: e.target.value }))} />
          <input aria-label="Email" type="email" placeholder="Email (optional)" className={fld} value={f.email} onChange={(e) => setF((o) => ({ ...o, email: e.target.value }))} />
          <Button disabled={busy || !complete} onClick={verify} className="w-full h-11 rounded-lg disabled:bg-muted disabled:text-muted-foreground">{busy ? "Sending…" : "Send verification code"}</Button>
        </div>
      )}
      <Button variant="link" size="sm" onClick={onClose} className="mx-auto flex text-xs text-muted-foreground">Close</Button>
    </div>
  );
}

const priceOf = (svc: string) => { const p = PRICED.find((x) => x.split(" — ")[0] === svc)?.split(" — ")[1]; return p ? Number(p.replace(/[^\d]/g, "")) : undefined; };

function EditBooking({ b, onClose, onConfirm }: { b: Booking; onClose: () => void; onConfirm: (nb: Booking & { cap: number }) => void }) {
  const [f, setF] = useState({ branch: b.branch, service: b.service, date: visitDateLabel(b.date), time: b.time, name: b.name, phone: b.phone });
  const [review, setReview] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { void refresh().then(() => tick((n) => n + 1)); }, [f.branch, f.date]);
  const label = labelFor(f.date);
  const free = f.branch && label ? dayTimes(label).filter((x) => !taken({ branch: f.branch, date: label }, b.id).includes(x)) : [];
  const set = (k: keyof typeof f, v: string) => { setReview(false); setF((o) => ({ ...o, [k]: v, ...(k === "branch" || k === "date" ? { time: "" } : {}) })); };
  const phone = f.phone.replace(/\s/g, "");
  const ok = f.branch && f.service && label && f.time && free.includes(f.time) && f.name.trim().length >= 2 && /^0[6-8]\d{8}$/.test(phone);
  const svcNames = [...new Set([b.service, ...PRICED.map((x) => x.split(" — ")[0]!)])];
  const oldP = priceOf(b.service), newP = priceOf(f.service);
  const diff = oldP !== undefined && newP !== undefined ? newP - oldP : undefined;
  const fld = "w-full h-11 bg-muted rounded-xl px-4 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";
  const lbl = "block space-y-1.5 text-sm font-medium text-foreground";
  return (
    <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 space-y-4 max-w-md">
      <div><h2 className="text-xl font-semibold text-foreground">Edit appointment {b.id}</h2><p className="text-sm text-muted-foreground">Change anything below, then review.</p></div>
      <label className={lbl}><span>Branch</span><select aria-label="Edit branch" className={fld} value={f.branch} onChange={(e) => set("branch", e.target.value)}>{BRANCHES.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label className={lbl}><span>Service</span><select aria-label="Edit service" className={fld} value={f.service} onChange={(e) => set("service", e.target.value)}>{svcNames.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label className={lbl}><span>Appointment date</span><input aria-label="Edit date" type="date" min={visitDateLabel("Today")} className={fld} value={f.date} onChange={(e) => set("date", e.target.value)} /></label>
      {f.date && !label && <p className="text-xs text-muted-foreground">Bookings are open for today, tomorrow and this Saturday only.</p>}
      <label className={lbl}><span>Available appointment time</span><select aria-label="Edit time" className={fld} value={f.time} disabled={!free.length} onChange={(e) => set("time", e.target.value)}><option value="">{f.branch && label && !free.length ? "Fully booked" : "Select available time"}</option>{free.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label className={lbl}><span>Name</span><input aria-label="Edit name" className={fld} value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
      <label className={lbl}><span>SA mobile number</span><input aria-label="Edit phone" className={fld} value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
      {!review ? (
        <button disabled={!ok} onClick={() => setReview(true)} className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-medium disabled:bg-muted disabled:text-muted-foreground">Review changes</button>
      ) : (
        <div className="space-y-3">
          <div className="bg-secondary rounded-xl p-3 text-sm space-y-1">
            <p className="font-medium">Original</p><p>{b.service} — {b.branch}, {b.date} at {b.time} · {b.name}, {b.phone}</p>
            <p className="font-medium pt-1">New</p><p>{f.service} — {f.branch}, {label} at {f.time} · {f.name.trim()}, {phone}</p>
            <p className="pt-1">Price difference: {diff === undefined ? "n/a" : diff === 0 ? "none" : `${diff > 0 ? "+" : "−"}R${Math.abs(diff).toLocaleString("en-ZA")}`}</p>
            <p>Deposit: R100 {b.paid ? "already paid — carries over" : "still due"} (no adjustment)</p>
          </div>
          <button onClick={() => onConfirm({ ...b, service: f.service, branch: f.branch, date: label!, time: f.time, name: f.name.trim(), phone, cap: capacity({ branch: f.branch, date: label! }) })} className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-medium">Confirm changes</button>
        </div>
      )}
      <button onClick={onClose} className="text-xs underline text-muted-foreground">Close</button>
    </div>
  );
}
