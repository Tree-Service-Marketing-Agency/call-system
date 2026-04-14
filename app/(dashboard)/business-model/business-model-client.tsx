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

export function BusinessModelClient() {
  const [priceUsd, setPriceUsd] = useState("");
  const [savedPriceCents, setSavedPriceCents] = useState<number | null>(null);
  const [thresholdUsd, setThresholdUsd] = useState("");
  const [savedThresholdCents, setSavedThresholdCents] = useState<number | null>(
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
        setThresholdUsd(centsToUsdString(data.billingThresholdCents));
        setSavedThresholdCents(data.billingThresholdCents);
        setUpdatedAt(data.updatedAt);
      });
  }, []);

  async function handleSave() {
    const priceCents = usdStringToCents(priceUsd);
    const thresholdCents = usdStringToCents(thresholdUsd);
    if (priceCents == null || thresholdCents == null) return;

    setLoading(true);
    setSuccess(false);

    const res = await fetch("/api/business-model", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pricePerCallCents: priceCents,
        billingThresholdCents: thresholdCents,
      }),
    });

    setLoading(false);

    if (res.ok) {
      setSavedPriceCents(priceCents);
      setSavedThresholdCents(thresholdCents);
      setUpdatedAt(new Date().toISOString());
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  }

  const dirty =
    usdStringToCents(priceUsd) !== savedPriceCents ||
    usdStringToCents(thresholdUsd) !== savedThresholdCents;

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Business model</CardTitle>
        <CardDescription>
          Price applied to future calls and the global billing threshold.
          Existing calls keep the price they were registered with.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
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
            <Label htmlFor="threshold">Billing threshold ($)</Label>
            <Input
              id="threshold"
              type="number"
              step="0.01"
              min="0"
              value={thresholdUsd}
              onChange={(e) => setThresholdUsd(e.target.value)}
            />
          </div>
          {updatedAt && (
            <p className="text-sm text-muted-foreground">
              Last updated {new Date(updatedAt).toLocaleDateString()}
            </p>
          )}
          <Button onClick={handleSave} disabled={loading || !dirty}>
            {loading ? "Saving..." : "Save changes"}
          </Button>
          {success && (
            <p className="text-sm text-green-600">Saved successfully</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
