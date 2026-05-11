"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function centsToUsdString(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function usdStringToCents(usd: string): number | null {
  const n = Number(usd);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function parsePositiveInt(input: string): number | null {
  const n = Number(input);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export function BusinessModelClient() {
  const [priceUsd, setPriceUsd] = useState("");
  const [savedPriceCents, setSavedPriceCents] = useState<number | null>(null);
  const [thresholdCalls, setThresholdCalls] = useState("");
  const [savedThresholdCalls, setSavedThresholdCalls] = useState<number | null>(
    null
  );
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/business-model")
      .then((res) => res.json())
      .then((data) => {
        setPriceUsd(centsToUsdString(data.pricePerCallCents));
        setSavedPriceCents(data.pricePerCallCents);
        setThresholdCalls(String(data.billingThresholdCalls ?? ""));
        setSavedThresholdCalls(data.billingThresholdCalls);
        setUpdatedAt(data.updatedAt);
      });
  }, []);

  async function handleSave() {
    const priceCents = usdStringToCents(priceUsd);
    const thresholdCallsValue = parsePositiveInt(thresholdCalls);
    if (priceCents == null || thresholdCallsValue == null) return;

    setLoading(true);
    setSuccess(false);

    const res = await fetch("/api/business-model", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pricePerCallCents: priceCents,
        billingThresholdCalls: thresholdCallsValue,
      }),
    });

    setLoading(false);

    if (res.ok) {
      setSavedPriceCents(priceCents);
      setSavedThresholdCalls(thresholdCallsValue);
      setUpdatedAt(new Date().toISOString());
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  }

  const dirty =
    usdStringToCents(priceUsd) !== savedPriceCents ||
    parsePositiveInt(thresholdCalls) !== savedThresholdCalls;

  return (
    <Card className="max-w-xl">
      <CardHeader className="border-b pb-4">
        <CardTitle>Pricing</CardTitle>
        <CardDescription>
          Price applied to future calls and the global billing threshold.
          Existing calls keep the price they were registered with. The
          threshold counts pending calls — once a company reaches it, all
          pending calls are charged together.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="price">Price per call ($)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={priceUsd}
                onChange={(e) => setPriceUsd(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="threshold">Billing threshold (calls)</Label>
              <Input
                id="threshold"
                type="number"
                step="1"
                min="1"
                value={thresholdCalls}
                onChange={(e) => setThresholdCalls(e.target.value)}
              />
            </div>
          </div>
          {updatedAt && (
            <p className="text-xs text-muted-foreground">
              Last updated {new Date(updatedAt).toLocaleDateString()}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={loading || !dirty}>
              {loading ? "Saving..." : "Save changes"}
            </Button>
            {success && (
              <span className="text-sm text-primary">Saved successfully</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
