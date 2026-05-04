"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2Icon,
  CopyIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { generatePassword } from "@/lib/password";
import { normalizeUsPhone } from "@/lib/phone";

type Mode = "form" | "loading" | "success";

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
  const [phones, setPhones] = useState<string[]>([""]);
  const [leadSnap, setLeadSnap] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Generate the password on the client after mount: doing it during render
  // would produce a hydration mismatch since SSR has no crypto entropy.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPassword(generatePassword());
  }, []);

  function resetForm() {
    setName("");
    setPhones([""]);
    setLeadSnap("");
    setEmail("");
    setPassword(generatePassword());
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Company name is required.");
      return;
    }
    if (!email.trim()) {
      setError("User email is required.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }

    const normalized: string[] = [];
    for (const raw of phones) {
      if (!raw.trim()) continue;
      const n = normalizeUsPhone(raw);
      if (!n) {
        setError(`Invalid US phone number: ${raw}`);
        return;
      }
      normalized.push(n);
    }
    if (normalized.length === 0) {
      setError("Add at least one US notification phone.");
      return;
    }

    setMode("loading");

    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        notificationPhones: normalized,
        leadSnapWebhook: leadSnap.trim() || null,
        userEmail: email.trim(),
        userPassword: password,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create company.");
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
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2Icon className="size-8 animate-spin" />
        <p className="text-sm">Creating company…</p>
      </div>
    );
  }

  if (mode === "success" && success) {
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
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2Icon className="size-12 text-primary" />
          <div className="flex flex-col gap-1">
            <CardTitle className="text-xl">Company created</CardTitle>
            <CardDescription>
              Save these credentials now — they won&apos;t be shown again.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm">
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
              onClick={() => {
                setSuccess(null);
                resetForm();
                setMode("form");
              }}
            >
              Create another company
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push("/")}
            >
              Go to dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-xl">Onboard a new company</CardTitle>
        <CardDescription>
          Create a company and its first user. The Retell agent can be added
          later from the company settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="company-name">Company name</Label>
            <Input
              id="company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Notification phones</Label>
            {phones.map((phone, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    const updated = [...phones];
                    updated[index] = e.target.value;
                    setPhones(updated);
                  }}
                  placeholder="(555) 123-4567"
                />
                {phones.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setPhones(phones.filter((_, i) => i !== index))
                    }
                    aria-label="Remove phone"
                  >
                    <XIcon />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPhones([...phones, ""])}
            >
              <PlusIcon data-icon="inline-start" />
              Add phone
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="leadsnap">LeadSnap key</Label>
            <Input
              id="leadsnap"
              value={leadSnap}
              onChange={(e) => setLeadSnap(e.target.value)}
              placeholder="Optional"
            />
            <p className="text-xs text-muted-foreground">
              Optional — you can add it later from the company settings.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">User email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Temporary password</Label>
            <div className="flex gap-2">
              <Input
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setPassword(generatePassword())}
                aria-label="Regenerate password"
              >
                <RefreshCwIcon />
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full">
            Create company
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
