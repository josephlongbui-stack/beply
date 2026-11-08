"use client";
import { BUSINESS_TYPES, type BusinessType } from "../domain/business";
import { useState } from "react";
import { MapPin, ArrowUpRight, Clock3 } from "lucide-react";
import { useApp, Card, Button, Field, Modal, Note, Badge } from "./ui";
import {
  US_STATES,
  US_TIMEZONES,
  suggestedZone,
  locationLabel,
  formatDateTime,
} from "../domain/location";
export function LocationCard() {
  const { state: s, openLocation } = useApp();
  return (
    <Card className="location-card">
      <div className="location-card-icon">
        <MapPin size={25} />
      </div>
      <div>
        <div className="eyebrow">YOUR BUSINESS, YOUR NEIGHBORHOOD</div>
        <h2>{locationLabel(s.location)}</h2>
        <p>
          {
            BUSINESS_TYPES.find(
              ([type]) => type === (s.business_type ?? "bakery"),
            )?.[1]
          }{" "}
          · {s.name}
        </p>
        <p>
          {s.location.postal_code} · {s.timezone.replaceAll("_", " ")} · USD
        </p>
        <Badge tone={s.price_mode === "sample" ? "warn" : "good"}>
          {s.price_mode === "sample"
            ? "Illustrative sample prices"
            : "Your local supplier quotes"}
        </Badge>
      </div>
      <Button variant="secondary" onClick={openLocation}>
        Location & prices <ArrowUpRight size={16} />
      </Button>
    </Card>
  );
}
export default function LocationEditor({ onClose }: { onClose: () => void }) {
  const { state: s, mutate, busy } = useApp();
  const [name, setName] = useState(s.name),
    [business, setBusiness] = useState<BusinessType>(
      s.business_type ?? "bakery",
    ),
    [location, setLocation] = useState(s.location),
    [timezone, setTimezone] = useState(s.timezone),
    [mode, setMode] = useState(s.price_mode);
  return (
    <Modal title="Your business & location" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await mutate({
              type: "location",
              name,
              business_type: business,
              location,
              timezone,
              price_mode: mode,
            })
          )
            onClose();
        }}
      >
        <div className="location-intro">
          <MapPin size={24} />
          <p>
            Made for your corner of the US. Set where you prepare food, then
            choose the prices you want to plan with.
          </p>
        </div>
        <Field label="Business type">
          <select
            value={business}
            onChange={(e) => setBusiness(e.target.value as BusinessType)}
          >
            {BUSINESS_TYPES.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Business name">
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="City">
            <input
              required
              maxLength={100}
              autoComplete="address-level2"
              value={location.city}
              onChange={(e) =>
                setLocation({ ...location, city: e.target.value })
              }
            />
          </Field>
          <Field label="State or territory">
            <select
              value={location.state}
              onChange={(e) => {
                setLocation({ ...location, state: e.target.value });
                setTimezone(suggestedZone(e.target.value));
              }}
            >
              <option value="" disabled>
                Select your state
              </option>
              {US_STATES.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="ZIP code"
            hint="Five digits or ZIP+4; entered by you, not geocoded."
          >
            <input
              required
              inputMode="numeric"
              autoComplete="postal-code"
              pattern="[0-9]{5}(-[0-9]{4})?"
              maxLength={10}
              value={location.postal_code}
              onChange={(e) =>
                setLocation({ ...location, postal_code: e.target.value })
              }
            />
          </Field>
          <Field
            label="Business timezone"
            hint="Suggested from the state. Confirm your local zone, especially in states with more than one."
          >
            <select
              aria-label="Business timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {US_TIMEZONES.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="location-preview">
          <Clock3 size={18} />
          <div>
            <strong>Preparation in this timezone</strong>
            <span>{formatDateTime(s.production.prep_starts_at, timezone)}</span>
          </div>
        </div>
        <Field label="Prices used for planning">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "sample" | "local")}
          >
            <option value="sample">Sample prices · explore the demo</option>
            <option value="local">
              Local prices · enter my supplier quotes
            </option>
          </select>
        </Field>
        <Note>
          {mode === "sample"
            ? "Sample suppliers and prices are fictional examples from Garden Grove, CA. They stay illustrative wherever you set your business; location does not turn them into live nearby prices."
            : "Only your quotes for this city and ZIP are eligible. Add suppliers, package prices, availability, tax and trip costs in Ingredient market. Missing quotes block approval until you add them. No live search or regional price estimates are connected."}
        </Note>
        <p className="small-copy">
          Existing events and deadlines keep their exact moment. Their displayed
          local times change; review preparation times after saving. Changing
          location or price mode requires a new approval. Sample workspaces use
          a fixed date; your own workspace uses the current time.
        </p>
        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy}>Save location & recalculate</Button>
        </div>
      </form>
    </Modal>
  );
}
