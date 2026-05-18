import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Calendar, Clock, Building2, User, Mail, Phone, Check, ArrowLeft, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";

// Máscara de telefone BR: (XX) XXXXX-XXXX
function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

const REVENUE_OPTIONS = [
  { label: "Até 30k", value: 25000 },
  { label: "30k - 50k", value: 40000 },
  { label: "50k - 100k", value: 75000 },
  { label: "100k - 300k", value: 200000 },
  { label: "300k+", value: 500000 },
];

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type SlotDay = { date: string; slots: string[] };

// Form fields in order
const FIELDS = ["name", "email", "phone", "company", "revenue"] as const;
type FieldKey = typeof FIELDS[number];

export default function BookMeeting() {
  const [searchParams] = useSearchParams();
  const utmSource = searchParams.get("utm_source") || "webinar_pitch";
  const utmCampaign = searchParams.get("utm_campaign") || "agendamento_0704";
  const utmContent = searchParams.get("utm_content") || null;
  const evento = searchParams.get("evento") || null;

  const [step, setStep] = useState<"form" | "calendar" | "waiting" | "done" | "already">("form");
  const [fieldIndex, setFieldIndex] = useState(0);

  // Form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [revenue, setRevenue] = useState<number | null>(null);

  // Calendar
  const [days, setDays] = useState<SlotDay[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookingResult, setBookingResult] = useState<{ meeting_link?: string; scheduled_at?: string } | null>(null);

  const qualifies = revenue !== null && revenue > 50000;
  const currentField = FIELDS[fieldIndex];

  const isFieldValid = (field: FieldKey) => {
    switch (field) {
      case "name": return name.trim().length >= 2;
      case "email": return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      case "phone": return phone.replace(/\D/g, "").length >= 10;
      case "company": return company.trim().length >= 2;
      case "revenue": return revenue !== null;
    }
  };

  const allValid = FIELDS.every(isFieldValid);

  // Fetch slots
  useEffect(() => {
    if (step === "calendar" && days.length === 0) {
      setLoadingSlots(true);
      supabase.functions.invoke("book-meeting", {
        body: { action: "check_availability", phone: phone.replace(/\D/g, ""), email },
      }).then(({ data }) => {
        if (data?.already_booked) {
          setBookingResult({ meeting_link: data.meeting_link, scheduled_at: data.scheduled_at });
          setStep("already");
        } else if (data?.days) {
          setDays(data.days);
          if (data.days.length > 0) setSelectedDate(data.days[0].date);
        }
        setLoadingSlots(false);
      });
    }
  }, [step]);

  const handleNext = () => {
    if (fieldIndex < FIELDS.length - 1) {
      setFieldIndex(fieldIndex + 1);
    } else if (allValid) {
      if (qualifies) setStep("calendar");
      else {
        setBooking(true);
        supabase.functions.invoke("book-meeting", {
          body: { action: "book", name, email, phone, company, revenue, utm_source: utmSource, utm_campaign: utmCampaign, utm_content: utmContent, evento },
        }).finally(() => { setBooking(false); setStep("waiting"); });
      }
    }
  };

  const handleBack = () => {
    if (fieldIndex > 0) setFieldIndex(fieldIndex - 1);
  };

  const handleBook = async () => {
    if (!selectedDate || !selectedTime) return;
    setBooking(true);
    const [h, m] = selectedTime.split(":").map(Number);
    const dt = new Date(`${selectedDate}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`);
    try {
      const { data } = await supabase.functions.invoke("book-meeting", {
        body: { action: "book", name, email, phone, company, revenue, slot_datetime: dt.toISOString(), utm_source: utmSource, utm_campaign: utmCampaign, utm_content: utmContent, evento },
      });
      setBookingResult({ meeting_link: data?.meeting_link, scheduled_at: dt.toISOString() });
    } catch {}
    setBooking(false);
    setStep("done");
  };

  const selectedDaySlots = useMemo(() => days.find(d => d.date === selectedDate)?.slots || [], [days, selectedDate]);
  const fmtDate = (s: string) => { const d = new Date(s + "T12:00:00"); return { day: d.getDate(), month: MONTH_NAMES[d.getMonth()], weekday: DAY_NAMES[d.getDay()] }; };
  const progress = Math.round(((fieldIndex + 1) / FIELDS.length) * 100);

  const fieldConfig: Record<FieldKey, { label: string; icon: any; placeholder: string; type: string }> = {
    name: { label: "Qual o seu nome?", icon: User, placeholder: "Nome completo", type: "text" },
    email: { label: "Qual o seu email?", icon: Mail, placeholder: "seu@email.com", type: "email" },
    phone: { label: "Qual o seu WhatsApp?", icon: Phone, placeholder: "(11) 99999-9999", type: "tel" },
    company: { label: "Qual a sua empresa?", icon: Building2, placeholder: "Nome da empresa", type: "text" },
    revenue: { label: "Qual o faturamento mensal?", icon: Calendar, placeholder: "", type: "select" },
  };

  const getFieldValue = (f: FieldKey) => ({ name, email, phone, company, revenue: "" }[f]);
  const setFieldValue = (f: FieldKey, v: string) => {
    switch (f) { case "name": setName(v); break; case "email": setEmail(v); break; case "phone": setPhone(maskPhone(v)); break; case "company": setCompany(v); break; }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="text-xl font-black text-gray-900 tracking-tight">CRM</span>
            <span className="text-[10px] font-bold text-gray-400 tracking-[3px] uppercase">AI-First</span>
          </div>
          {step === "form" && fieldIndex === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
              <h1 className="text-xl font-bold text-gray-900 mb-1">Agende sua reunião com nosso especialista</h1>
              <p className="text-sm text-gray-500">Vamos entender seu negócio e mostrar como IA pode te ajudar</p>
            </motion.div>
          )}
        </motion.div>

        <AnimatePresence mode="wait">
          {/* ── FORM: One field at a time ── */}
          {step === "form" && (
            <motion.div key={`field-${fieldIndex}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
              <div className="bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100 p-6">
                {/* Progress bar */}
                <div className="h-1 bg-gray-100 rounded-full mb-6 overflow-hidden">
                  <motion.div className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
                </div>

                <p className="text-xs text-gray-400 mb-1">{fieldIndex + 1} de {FIELDS.length}</p>
                <h2 className="text-lg font-bold text-gray-900 mb-4">{fieldConfig[currentField].label}</h2>

                {currentField === "revenue" ? (
                  <div className="grid grid-cols-2 gap-2">
                    {REVENUE_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => setRevenue(opt.value)}
                        className={cn("py-3 px-3 rounded-xl text-sm font-medium border-2 transition-all duration-200",
                          revenue === opt.value ? "border-orange-500 bg-orange-50 text-orange-700 shadow-sm" : "border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200"
                        )}>{opt.label}</button>
                    ))}
                  </div>
                ) : currentField === "phone" ? (
                  <div>
                    <PhoneInput
                      country="br"
                      value={phone.replace(/\D/g, "")}
                      onChange={(value) => setPhone(value)}
                      preferredCountries={["br", "us", "pt"]}
                      enableSearch
                      searchPlaceholder="Buscar país..."
                      inputStyle={{
                        width: "100%",
                        height: 48,
                        fontSize: 16,
                        borderRadius: 12,
                        borderColor: "#e5e7eb",
                        paddingLeft: 48,
                      }}
                      buttonStyle={{
                        borderRadius: "12px 0 0 12px",
                        borderColor: "#e5e7eb",
                        background: "#f9fafb",
                      }}
                      containerStyle={{ width: "100%" }}
                      inputProps={{
                        autoFocus: true,
                        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" && isFieldValid("phone")) handleNext(); },
                      }}
                    />
                  </div>
                ) : (
                  <div className="relative">
                    {(() => { const Icon = fieldConfig[currentField].icon; return <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />; })()}
                    <Input
                      type={fieldConfig[currentField].type}
                      value={getFieldValue(currentField)}
                      onChange={e => setFieldValue(currentField, e.target.value)}
                      placeholder={fieldConfig[currentField].placeholder}
                      className="pl-11 h-12 text-base border-gray-200 focus-visible:ring-orange-500/30 rounded-xl"
                      autoFocus
                      onKeyDown={e => { if (e.key === "Enter" && isFieldValid(currentField)) handleNext(); }}
                    />
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between mt-6">
                  <button onClick={handleBack} disabled={fieldIndex === 0}
                    className={cn("w-10 h-10 rounded-full flex items-center justify-center transition-all", fieldIndex === 0 ? "text-gray-200" : "text-gray-400 hover:bg-gray-100")}>
                    <ArrowLeft className="w-5 h-5" />
                  </button>

                  <button onClick={handleNext} disabled={!isFieldValid(currentField) || booking}
                    className={cn("py-3 px-8 rounded-xl text-sm font-bold flex items-center gap-2 transition-all duration-300",
                      isFieldValid(currentField) ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25 hover:shadow-xl" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    )}>
                    {booking ? <Loader2 className="w-4 h-4 animate-spin" /> :
                      fieldIndex === FIELDS.length - 1 ? <><Check className="w-4 h-4" /> Confirmar</> : <>Próximo <ArrowRight className="w-4 h-4" /></>
                    }
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── CALENDAR ── */}
          {step === "calendar" && (
            <motion.div key="calendar" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
              <div className="bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100 p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <button onClick={() => { setStep("form"); setFieldIndex(FIELDS.length - 1); }} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                    <ArrowLeft className="w-4 h-4 text-gray-600" />
                  </button>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Escolha o horário</h2>
                    <p className="text-xs text-gray-500">Escolha o dia e horário que funciona pra você</p>
                  </div>
                </div>

                {loadingSlots ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-orange-500 mb-3" />
                    <p className="text-sm text-gray-500">Buscando horários...</p>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      {days.map(day => {
                        const { day: d, month, weekday } = fmtDate(day.date);
                        const sel = selectedDate === day.date;
                        const has = day.slots.length > 0;
                        return (
                          <button key={day.date} onClick={() => { setSelectedDate(day.date); setSelectedTime(null); }} disabled={!has}
                            className={cn("flex-1 py-3 px-2 rounded-xl border-2 transition-all text-center",
                              sel ? "border-orange-500 bg-orange-50 shadow-sm" : has ? "border-gray-100 bg-gray-50 hover:border-gray-200" : "border-gray-50 opacity-40 cursor-not-allowed")}>
                            <p className={cn("text-[10px] font-bold uppercase tracking-wider", sel ? "text-orange-600" : "text-gray-400")}>{weekday}</p>
                            <p className={cn("text-2xl font-black", sel ? "text-orange-600" : "text-gray-700")}>{d}</p>
                            <p className={cn("text-xs font-medium", sel ? "text-orange-500" : "text-gray-400")}>{month}</p>
                          </button>
                        );
                      })}
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5 mb-3">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Horários disponíveis</span>
                      </div>
                      {selectedDaySlots.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-6">Nenhum horário disponível</p>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {selectedDaySlots.map(time => (
                            <button key={time} onClick={() => setSelectedTime(time)} className={cn(
                              "py-3 rounded-xl text-sm font-semibold border-2 transition-all",
                              selectedTime === time ? "border-orange-500 bg-orange-500 text-white shadow-md shadow-orange-500/25" : "border-gray-100 bg-white text-gray-700 hover:border-orange-300 hover:bg-orange-50"
                            )}>{time}</button>
                          ))}
                        </div>
                      )}
                    </div>

                    {selectedTime && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                        <button onClick={handleBook} disabled={booking}
                          className="w-full py-3.5 rounded-xl text-sm font-bold bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 transition-all">
                          {booking ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Calendar className="w-4 h-4" />Confirmar {selectedTime} - {fmtDate(selectedDate!).day} {fmtDate(selectedDate!).month}</>}
                        </button>
                      </motion.div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          )}

          {/* ── WAITING (< 50k) ── */}
          {step === "waiting" && (
            <motion.div key="waiting" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, type: "spring" }}>
              <div className="bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100 p-8 text-center space-y-4">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </motion.div>
                <h2 className="text-xl font-bold text-gray-900">Recebemos seu interesse!</h2>
                <p className="text-sm text-gray-500 leading-relaxed">Nossa equipe vai entrar em contato para confirmar o melhor horário pra você.</p>
                <div className="bg-orange-50 rounded-xl p-4"><p className="text-sm text-orange-700 font-medium">Fique atento ao seu WhatsApp!</p></div>
              </div>
            </motion.div>
          )}

          {/* ── ALREADY BOOKED ── */}
          {step === "already" && (
            <motion.div key="already" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, type: "spring" }}>
              <div className="bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100 p-8 text-center space-y-4">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
                  <Calendar className="w-8 h-8 text-blue-600" />
                </motion.div>
                <h2 className="text-xl font-bold text-gray-900">Você já tem reunião agendada!</h2>
                {bookingResult?.scheduled_at && (
                  <div className="bg-blue-50 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-center gap-2 text-gray-700">
                      <Calendar className="w-4 h-4 text-blue-500" />
                      <span className="font-semibold">{new Date(bookingResult.scheduled_at).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" })}</span>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-gray-700">
                      <Clock className="w-4 h-4 text-blue-500" />
                      <span className="font-semibold text-lg">{new Date(bookingResult.scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</span>
                    </div>
                  </div>
                )}
                <p className="text-sm text-gray-500">Qualquer dúvida, fale com a gente pelo WhatsApp.</p>
              </div>
            </motion.div>
          )}

          {/* ── DONE (>= 50k, agendou) ── */}
          {step === "done" && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, type: "spring" }}>
              <div className="bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100 p-8 text-center space-y-4">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </motion.div>
                <h2 className="text-xl font-bold text-gray-900">Reunião confirmada!</h2>
                {bookingResult?.scheduled_at && (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-center gap-2 text-gray-700">
                      <Calendar className="w-4 h-4 text-orange-500" />
                      <span className="font-semibold">{new Date(bookingResult.scheduled_at).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" })}</span>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-gray-700">
                      <Clock className="w-4 h-4 text-orange-500" />
                      <span className="font-semibold text-lg">{new Date(bookingResult.scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</span>
                    </div>
                  </div>
                )}
                <p className="text-sm text-gray-500">Você receberá o link por <strong>WhatsApp</strong> e <strong>email</strong>.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-center text-[10px] text-gray-300 mt-6">IA na Prática — Equipe do Frank Costa</p>
      </div>
    </div>
  );
}
