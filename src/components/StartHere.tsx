"use client";
import { useState } from "react";
import { ArrowUpRight, Check, ArrowRight } from "lucide-react";
import { useApp, Button } from "./ui";
import UploadIntake from "./UploadIntake";
import { DocumentReview } from "./Documents";
import { BanhMiMark } from "./Logo";
export default function StartHere() {
  const { state: s, setView, openLocation, switchWorkspace } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const doc = s.documents.find((d) => d.id === selected);
  const steps = [
    {
      title: "Make yourself at home.",
      detail: "Set your business’s location and local timezone.",
      done: !!s.location.city,
      action: openLocation,
      label: "Set location",
    },
    {
      title: "Tell us what goes in.",
      detail: "Review a recipe, then count the ingredients you already have.",
      done:
        !!s.recipes.length &&
        s.ingredients.every((i) => i.confidence === "confirmed"),
      action: () => setView(s.recipes.length ? "stock" : "documents"),
      label: s.recipes.length ? "Count your stock" : "Add your recipes",
    },
    {
      title: "Bring your local prices.",
      detail: "Enter supplier package prices from a quote or recent receipt.",
      done: !!s.offers.length,
      action: () => setView("market"),
      label: "Add supplier quotes",
    },
    {
      title: "Give your next service a plan.",
      detail:
        "Choose quantities, prep time, budget and shopping stops. We calculate from there.",
      done: !!s.production.items.length,
      action: () => setView("plan"),
      label: "Plan your production",
    },
  ];
  return (
    <>
      <section className="start-hero">
        <div className="start-copy">
          <div className="eyebrow">
            <span className="live-dot" /> A FRESH START FOR YOUR KITCHEN
          </div>
          <h1>
            Good food.
            <br />
            <em>Better</em>
            <br />
            numbers.
          </h1>
          <p>
            Bakeries. Cafés. Restaurants.
            <br />
            Food trucks. Caterers.
            <br />A little more clarity in every batch.
          </p>
          <div className="start-stamp">
            <BanhMiMark />
            <span>
              MADE FOR
              <br />
              <strong>your kitchen.</strong>
            </span>
          </div>
        </div>
        <UploadIntake
          onUploaded={setSelected}
          onManual={() => setView("documents")}
        />
      </section>
      <section className="setup-section" aria-label="Set up your business">
        <div className="setup-heading">
          <span className="eyebrow">LET’S BUILD YOUR STARTING PICTURE</span>
          <h2>
            No guesses.
            <br />
            Just your ingredients.
          </h2>
          <p>
            No stock, supplier prices or recipes have been preloaded here. Your
            results appear as you confirm your inputs.
          </p>
        </div>
        <div className="setup-steps">
          {steps.map((step, i) => (
            <button
              key={step.title}
              onClick={step.action}
              className={`setup-step ${step.done ? "done" : ""}`}
            >
              <span className="step-number">
                {step.done ? <Check /> : `0${i + 1}`}
              </span>
              <span>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
                <b>
                  {step.label} <ArrowUpRight size={15} />
                </b>
              </span>
              <ArrowRight className="step-arrow" />
            </button>
          ))}
        </div>
      </section>
      <div className="sample-invitation">
        <div>
          <span className="eyebrow">WANT TO SEE A FINISHED EXAMPLE?</span>
          <h2>Take the sample bakery for a spin.</h2>
          <p>
            Fictional recipes, stock and prices in a separate workspace. Your
            own records stay here.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void switchWorkspace("sample")}
        >
          Explore sample bakery <ArrowUpRight size={18} />
        </Button>
      </div>
      {doc && (
        <DocumentReview
          key={doc.id}
          doc={doc}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
