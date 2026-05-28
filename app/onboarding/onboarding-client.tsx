"use client";

import { useRef, useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  MailIcon,
  PhoneIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { generatePassword } from "@/lib/password";
import { normalizeUsPhone } from "@/lib/phone";
import { NOTE_MAX_LENGTH } from "@/lib/notification-phones";

type Mode = "form" | "loading" | "success";

interface PhoneDraft {
  phone: string;
  note: string;
}

const EMPTY_PHONE: PhoneDraft = { phone: "", note: "" };

interface SuccessState {
  companyName: string;
  email: string;
  password: string;
}

export function OnboardingClient() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("form");
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const [name, setName] = useState("");
  const [areaCode, setAreaCode] = useState("");
  const [phones, setPhones] = useState<PhoneDraft[]>([EMPTY_PHONE]);
  const [hasLeadSnap, setHasLeadSnap] = useState(false);
  const [leadSnap, setLeadSnap] = useState("");
  const [showLeadSnap, setShowLeadSnap] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const nameRef = useRef<HTMLInputElement>(null);
  const areaCodeRef = useRef<HTMLInputElement>(null);
  const leadSnapRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const phoneRefs = useRef<(HTMLInputElement | null)[]>([]);
  const noteRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Generate the password on the client after mount: doing it during render
  // would produce a hydration mismatch since SSR has no crypto entropy.
  useMountEffect(() => {
    setPassword(generatePassword());
  });

  function resetForm() {
    setName("");
    setAreaCode("");
    setPhones([EMPTY_PHONE]);
    setHasLeadSnap(false);
    setLeadSnap("");
    setShowLeadSnap(false);
    setEmail("");
    setPassword(generatePassword());
  }

  function failValidation(message: string, focus?: HTMLElement | null) {
    toast.error(message);
    focus?.focus();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      failValidation("Company name is required.", nameRef.current);
      return;
    }
    if (!/^[0-9]{3}$/.test(areaCode.trim())) {
      failValidation("Area code must be exactly 3 digits.", areaCodeRef.current);
      return;
    }

    const normalized: { phone: string; note: string; disabled: boolean }[] = [];
    for (let i = 0; i < phones.length; i++) {
      const entry = phones[i];
      if (!entry.phone.trim()) continue;
      const n = normalizeUsPhone(entry.phone);
      if (!n) {
        failValidation(
          `Invalid US phone number: ${entry.phone}`,
          phoneRefs.current[i]
        );
        return;
      }
      const note = entry.note.trim();
      if (note.length > NOTE_MAX_LENGTH) {
        failValidation(
          `Note must be ${NOTE_MAX_LENGTH} characters or fewer.`,
          noteRefs.current[i]
        );
        return;
      }
      // Phones onboarded are always active; `disabled` is managed later
      // from the company Settings tab (ADR-008).
      normalized.push({ phone: n, note, disabled: false });
    }
    if (normalized.length === 0) {
      failValidation(
        "Add at least one US notification phone.",
        phoneRefs.current[0]
      );
      return;
    }

    if (hasLeadSnap && !leadSnap.trim()) {
      failValidation("LeadSnap key is required when enabled.", leadSnapRef.current);
      return;
    }

    if (!email.trim()) {
      failValidation("User email is required.", emailRef.current);
      return;
    }
    if (!password) {
      failValidation("Password is required.", passwordRef.current);
      return;
    }

    setMode("loading");

    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        areaCode: areaCode.trim(),
        notificationPhones: normalized,
        leadSnapWebhook: hasLeadSnap ? leadSnap.trim() || null : null,
        userEmail: email.trim(),
        userPassword: password,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to create company.");
      setMode("form");
      return;
    }

    const data = (await res.json()) as {
      company: { id: string; name: string };
      user: { email: string; password: string };
    };

    setSuccess({
      companyName: data.company.name,
      email: data.user.email,
      password: data.user.password,
    });
    setMode("success");
  }

  if (mode === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2Icon className="size-8 animate-spin" />
          <p className="text-sm">Creating company…</p>
        </div>
      </div>
    );
  }

  if (mode === "success" && success) {
    return (
      <SuccessView
        success={success}
        onCreateAnother={() => {
          setSuccess(null);
          resetForm();
          setMode("form");
        }}
        onGoHome={() => router.push("/companies")}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[980px] px-6 pt-7 pb-28">
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight">
          Onboard a new company
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a company and its first user. The Retell agent can be added
          later from company settings.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="gap-0 p-0">
          {/* Company */}
          <TwoColRow
            title="Company"
            sub="Name and the area code we'll use for outbound."
          >
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <Field label="Company name" required htmlFor="company-name">
                <Input
                  id="company-name"
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Buffalo Tree Co."
                  autoComplete="off"
                  required
                />
              </Field>
              <Field label="Area code" required htmlFor="area-code">
                <Input
                  id="area-code"
                  ref={areaCodeRef}
                  value={areaCode}
                  onChange={(e) =>
                    setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))
                  }
                  placeholder="415"
                  inputMode="numeric"
                  maxLength={3}
                  className="font-mono tracking-wider"
                  required
                />
              </Field>
            </div>
          </TwoColRow>

          {/* Notification phones */}
          <TwoColRow
            title="Notification phones"
            sub="Where call alerts get sent. Add a short note so you remember whose number it is."
            aside={`${phones.filter((p) => p.phone.trim()).length} added`}
          >
            <div className="flex flex-col gap-2">
              {phones.map((entry, index) => (
                <PhoneRow
                  key={index}
                  phone={entry}
                  canRemove={phones.length > 1}
                  phoneRef={(el) => {
                    phoneRefs.current[index] = el;
                  }}
                  noteRef={(el) => {
                    noteRefs.current[index] = el;
                  }}
                  onChange={(field, value) => {
                    const updated = [...phones];
                    updated[index] = { ...updated[index], [field]: value };
                    setPhones(updated);
                  }}
                  onRemove={() =>
                    setPhones(phones.filter((_, i) => i !== index))
                  }
                />
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setPhones([...phones, EMPTY_PHONE])}
              >
                <PlusIcon data-icon="inline-start" />
                Add phone
              </Button>
            </div>
          </TwoColRow>

          {/* LeadSnap */}
          <TwoColRow
            title="LeadSnap"
            sub="Sync calls into the client's existing LeadSnap workspace as new leads."
          >
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <span className="font-medium">Does this client use LeadSnap?</span>
              </div>
              <Segmented
                value={hasLeadSnap ? "yes" : "no"}
                onChange={(v) => {
                  const next = v === "yes";
                  setHasLeadSnap(next);
                  if (!next) {
                    setLeadSnap("");
                    setShowLeadSnap(false);
                  }
                }}
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]}
              />
            </div>

            <div
              className={cn(
                "grid transition-all duration-200",
                hasLeadSnap
                  ? "mt-3 grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
              )}
            >
              <div className="overflow-hidden">
                <Field label="API key" required htmlFor="leadsnap">
                  <div className="flex h-8 w-full items-center rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                    <Input
                      id="leadsnap"
                      ref={leadSnapRef}
                      type={showLeadSnap ? "text" : "password"}
                      value={leadSnap}
                      onChange={(e) => setLeadSnap(e.target.value)}
                      placeholder="Paste from LeadSnap → Settings → API"
                      className="h-full border-0 bg-transparent font-mono text-[12.5px] shadow-none focus-visible:ring-0"
                      autoComplete="off"
                    />
                    {leadSnap && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="mr-1 text-muted-foreground"
                        onClick={() => setShowLeadSnap((s) => !s)}
                        aria-label={showLeadSnap ? "Hide key" : "Show key"}
                      >
                        {showLeadSnap ? <EyeOffIcon /> : <EyeIcon />}
                      </Button>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <ShieldIcon className="size-3" />
                    Stored encrypted at rest.
                  </div>
                </Field>
              </div>
            </div>
          </TwoColRow>

          {/* First user */}
          <TwoColRow
            title="First user"
            sub="The login we'll email to the client. They can add more from inside."
            last
          >
            <Field label="User email" required htmlFor="email">
              <div className="flex h-8 w-full items-center rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                <MailIcon className="ml-2.5 size-3.5 text-muted-foreground" />
                <Input
                  id="email"
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@treeservice.com"
                  className="h-full border-0 bg-transparent shadow-none focus-visible:ring-0"
                  autoComplete="off"
                  required
                />
              </div>
            </Field>
            <div className="mt-3">
              <Field
                label="Temporary password"
                help="Auto-generated. Client resets on first sign-in."
                htmlFor="password"
              >
                <div className="flex h-8 w-full items-center rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                  <Input
                    id="password"
                    ref={passwordRef}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-full border-0 bg-transparent font-mono text-[12.5px] shadow-none focus-visible:ring-0"
                    autoComplete="off"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="mr-1 text-muted-foreground"
                    onClick={() => setPassword(generatePassword())}
                    aria-label="Regenerate password"
                  >
                    <RefreshCwIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="mr-1 text-muted-foreground"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(password);
                        toast.success("Password copied");
                      } catch {
                        toast.error("Could not copy password");
                      }
                    }}
                    aria-label="Copy password"
                  >
                    <CopyIcon />
                  </Button>
                </div>
              </Field>
            </div>
          </TwoColRow>
        </Card>

        {/* Sticky bottom bar */}
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-[980px] items-center justify-between gap-3 px-6 py-2.5">
            <div className="text-xs text-muted-foreground">
              Retell agent can be linked later.
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => router.push("/companies")}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Create company
                <ChevronRightIcon data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

/* ---------- helpers ---------- */

function TwoColRow({
  title,
  sub,
  aside,
  last,
  children,
}: {
  title: string;
  sub: string;
  aside?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid items-start gap-7 px-6 py-5",
        !last && "border-b border-border",
        "grid-cols-1 md:grid-cols-[260px_1fr]"
      )}
    >
      <div className="pt-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {aside && (
            <span className="text-xs text-muted-foreground">{aside}</span>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {sub}
        </p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  help,
  htmlFor,
  children,
}: {
  label?: string;
  required?: boolean;
  help?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {label && (
        <Label htmlFor={htmlFor} className="mb-1 text-xs">
          {label}
          {required && (
            <span className="ml-0.5 text-destructive" aria-hidden>
              *
            </span>
          )}
        </Label>
      )}
      {children}
      {help && (
        <p className="mt-1 text-[11px] text-muted-foreground">{help}</p>
      )}
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div
      role="radiogroup"
      className="inline-flex rounded-md border border-border bg-background p-0.5"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "h-6 rounded px-2.5 text-xs font-medium transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function PhoneRow({
  phone,
  canRemove,
  onChange,
  onRemove,
  phoneRef,
  noteRef,
}: {
  phone: PhoneDraft;
  canRemove: boolean;
  onChange: (field: "phone" | "note", value: string) => void;
  onRemove: () => void;
  phoneRef: (el: HTMLInputElement | null) => void;
  noteRef: (el: HTMLInputElement | null) => void;
}) {
  const len = phone.note.length;
  const nearLimit = len > NOTE_MAX_LENGTH * 0.85;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-8 w-[195px] shrink-0 items-center rounded-lg border border-input bg-card transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <PhoneIcon className="ml-2.5 size-3.5 text-muted-foreground" />
        <Input
          ref={phoneRef}
          type="tel"
          value={phone.phone}
          onChange={(e) => onChange("phone", e.target.value)}
          placeholder="+1(716)671-1980"
          className="h-full border-0 bg-transparent font-mono text-[12.5px] shadow-none focus-visible:ring-0"
          autoComplete="off"
        />
      </div>
      <div className="flex h-8 min-w-0 flex-1 items-center rounded-lg border border-input bg-card transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <Input
          ref={noteRef}
          value={phone.note}
          maxLength={NOTE_MAX_LENGTH}
          onChange={(e) =>
            onChange("note", e.target.value.slice(0, NOTE_MAX_LENGTH))
          }
          placeholder="Note — whose number? (optional)"
          className="h-full border-0 bg-transparent text-[13px] shadow-none focus-visible:ring-0"
        />
        <span
          className={cn(
            "shrink-0 pr-2.5 pl-1.5 font-mono text-[11px] tabular-nums",
            nearLimit ? "text-destructive" : "text-muted-foreground"
          )}
          aria-live="polite"
        >
          {len}/{NOTE_MAX_LENGTH}
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!canRemove}
        onClick={onRemove}
        className="text-muted-foreground"
        aria-label="Remove phone"
      >
        <XIcon />
      </Button>
    </div>
  );
}

function SuccessView({
  success,
  onCreateAnother,
  onGoHome,
}: {
  success: SuccessState;
  onCreateAnother: () => void;
  onGoHome: () => void;
}) {
  const block = `${success.companyName}\nUser: ${success.email}\nPassword: ${success.password}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(block);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy. Select and copy manually.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-[560px] px-6 pt-12 pb-12">
      <Card className="gap-0 p-0">
        <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-4 text-center">
          <CheckCircle2Icon className="size-10 text-primary" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Company created
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Save these credentials now — they won&apos;t be shown again.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 px-6 pb-6">
          <pre className="rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
            {block}
          </pre>
          <Button type="button" onClick={copy} className="w-full">
            <CopyIcon data-icon="inline-start" />
            Copy
          </Button>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCreateAnother}
            >
              Create another company
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onGoHome}>
              Go to companies
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
