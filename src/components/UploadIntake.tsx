"use client";
import { useRef, useState } from "react";
import { ArrowUpRight, Camera, FileImage, Upload } from "lucide-react";
import { useApp, Button } from "./ui";
import { sendSource } from "./cloud-upload";
import type { DocumentRecord } from "../domain/types";

export default function UploadIntake({
  onUploaded,
  onManual,
}: {
  onUploaded: (id: string) => void;
  onManual: () => void;
}) {
  const { setPayload, setNotice, cloud } = useApp();
  const fileRef = useRef<HTMLInputElement>(null),
    cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dragging, setDragging] = useState(false),
    [kind, setKind] = useState<DocumentRecord["type"]>("manual");
  async function upload(files: FileList | null) {
    if (!files?.length || busy) return;
    if (files.length > 1) {
      setError("Upload one source at a time so you can review each document.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await sendSource(files[0], "document", { kind }, cloud);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPayload(data);
      onUploaded(
        res.headers.get("X-Document-Id") ?? data.state.documents[0].id,
      );
      setNotice(
        "Source saved. Review its facts before updating your business.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }
  return (
    <section
      className={`upload-intake ${dragging ? "is-dragging" : ""}`}
      aria-label="Upload your business documents"
      aria-busy={busy}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <div className="paper-art" aria-hidden="true">
        <FileImage size={48} strokeWidth={1.3} />
        <span>FROM YOUR KITCHEN</span>
        <i />
        <i />
        <i />
      </div>
      <div className="eyebrow">PHOTOS → REVIEWED FACTS → YOUR PLAN</div>
      <h2>
        Put your paperwork
        <br />
        to work.
      </h2>
      <p>
        Drop a recipe, invoice or receipt here.
        <br />A phone photo is a great place to start.
      </p>
      <label className="intake-kind">
        What are you adding?
        <select
          aria-label="Upload document type"
          value={kind}
          onChange={(e) => setKind(e.target.value as DocumentRecord["type"])}
        >
          <option value="manual">Choose during review</option>
          <option value="recipe">Recipe</option>
          <option value="invoice">Invoice</option>
          <option value="receipt">Receipt</option>
          <option value="statement">Payment statement</option>
        </select>
      </label>
      <input
        id="document-upload"
        aria-label="Upload source file"
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf,text/csv,.svg"
        hidden
        onChange={(e) => void upload(e.target.files)}
      />
      <input
        aria-label="Take document photo"
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void upload(e.target.files)}
      />
      <div className="button-row">
        <Button disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload size={18} />
          {busy ? "Saving source…" : "Choose file"}
        </Button>
        <Button
          disabled={busy}
          variant="secondary"
          onClick={() => cameraRef.current?.click()}
        >
          <Camera size={18} />
          Take a photo
        </Button>
      </div>
      <button className="text-button intake-manual" onClick={onManual}>
        Enter details manually <ArrowUpRight size={16} />
      </button>
      <p className="caption">
        PNG, JPEG, WebP, PDF or CSV · 8 MB per file. Export HEIC as JPEG. Your
        uploads stay in your private workspace.
      </p>
      <div className="intake-disclosure">
        {cloud
          ? "External document reading is not connected. Review your source and confirm its fields, or import a CSV. No file is sent to an AI provider."
          : "Read text locally from supported images and PDFs during review. You confirm quantities and matches before anything changes. Labeled sample files use sample extraction."}
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
