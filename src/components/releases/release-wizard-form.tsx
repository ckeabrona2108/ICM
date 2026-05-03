"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import * as React from "react";

import { platformList } from "@/lib/mock-data";
import { useReleaseWizardStore } from "@/store/release-wizard-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ReleaseStepper } from "@/components/releases/release-stepper";

export function ReleaseWizardForm() {
  const state = useReleaseWizardStore();
  const [errors, setErrors] = useState<string[]>([]);

  const canSubmit = useMemo(
    () => Boolean(state.title && state.artist && state.genre && state.audioFile && state.coverFile),
    [state.audioFile, state.artist, state.coverFile, state.genre, state.title]
  );

  function validateStep(step: number) {
    const nextErrors: string[] = [];

    if (step === 1) {
      if (!state.title) nextErrors.push("Release title is required.");
      if (!state.artist) nextErrors.push("Artist is required.");
      if (!state.genre) nextErrors.push("Genre is required.");
      if (!state.releaseDate) nextErrors.push("Release date is required.");
    }

    if (step === 2) {
      if (!state.audioFile) nextErrors.push("Audio file is required.");
      if (!state.coverFile) nextErrors.push("Cover image is required.");
      if (state.audioFile && !["audio/wav", "audio/x-wav", "audio/flac"].includes(state.audioFile.type)) {
        nextErrors.push("Audio must be WAV or FLAC.");
      }
      if (state.coverFile && !state.coverFile.type.startsWith("image/")) {
        nextErrors.push("Cover must be an image file.");
      }
    }

    if (step === 4 && !Object.values(state.platforms).some(Boolean)) {
      nextErrors.push("Select at least one distribution platform.");
    }

    setErrors(nextErrors);
    return nextErrors.length === 0;
  }

  function handleNext() {
    if (validateStep(state.step)) {
      state.nextStep();
    }
  }

  function handleSubmit() {
    if (!validateStep(5) || !canSubmit) {
      return;
    }

    window.alert("Release submitted to moderation queue.");
    state.reset();
    setErrors([]);
  }

  const coverPreview = state.coverFile ? URL.createObjectURL(state.coverFile) : null;

  return (
    <Card>
      <CardContent className="space-y-6">
        <ReleaseStepper currentStep={state.step} />

        {errors.length > 0 ? (
          <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
            <ul className="space-y-1">
              {errors.map((error) => (
                <li key={error}>• {error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <AnimatePresence mode="wait">
          <motion.div
            key={state.step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="grid gap-4"
          >
            {state.step === 1 ? <StepBasicInfo /> : null}
            {state.step === 2 ? <StepFiles coverPreview={coverPreview} /> : null}
            {state.step === 3 ? <StepMetadata /> : null}
            {state.step === 4 ? <StepPlatforms /> : null}
            {state.step === 5 ? <StepReview canSubmit={canSubmit} /> : null}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" onClick={state.prevStep} disabled={state.step === 1}>
            Back
          </Button>

          {state.step < 5 ? (
            <Button onClick={handleNext}>Continue</Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              Submit to Moderation
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StepBasicInfo() {
  const state = useReleaseWizardStore();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field>
        <Label htmlFor="release-title">Release Title</Label>
        <Input
          id="release-title"
          placeholder="Neon Afterglow"
          value={state.title}
          onChange={(event) => state.setField("title", event.target.value)}
        />
      </Field>
      <Field>
        <Label htmlFor="release-artist">Artist</Label>
        <Input
          id="release-artist"
          placeholder="Nova Echo"
          value={state.artist}
          onChange={(event) => state.setField("artist", event.target.value)}
        />
      </Field>
      <Field>
        <Label htmlFor="release-genre">Genre</Label>
        <Input
          id="release-genre"
          placeholder="Synthwave"
          value={state.genre}
          onChange={(event) => state.setField("genre", event.target.value)}
        />
      </Field>
      <Field>
        <Label htmlFor="release-language">Language</Label>
        <Select
          id="release-language"
          value={state.language}
          onChange={(event) => state.setField("language", event.target.value)}
          options={[
            { label: "English", value: "English" },
            { label: "Russian", value: "Russian" },
            { label: "Spanish", value: "Spanish" },
            { label: "Instrumental", value: "Instrumental" }
          ]}
        />
      </Field>
      <Field>
        <Label htmlFor="release-date">Release Date</Label>
        <Input
          id="release-date"
          type="date"
          value={state.releaseDate}
          onChange={(event) => state.setField("releaseDate", event.target.value)}
        />
      </Field>
      <Field>
        <Label htmlFor="release-type">Release Type</Label>
        <Select
          id="release-type"
          value={state.type}
          onChange={(event) => state.setField("type", event.target.value as "single" | "ep" | "album")}
          options={[
            { label: "Single", value: "single" },
            { label: "EP", value: "ep" },
            { label: "Album", value: "album" }
          ]}
        />
      </Field>
    </div>
  );
}

function StepFiles({ coverPreview }: { coverPreview: string | null }) {
  const state = useReleaseWizardStore();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field>
        <Label htmlFor="audio-file">Audio File (WAV/FLAC)</Label>
        <Input
          id="audio-file"
          type="file"
          accept=".wav,.flac,audio/wav,audio/flac"
          onChange={(event) => state.setField("audioFile", event.target.files?.[0])}
        />
        {state.audioFile ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-sm text-white">{state.audioFile.name}</p>
            <audio controls className="mt-2 w-full">
              <source src={URL.createObjectURL(state.audioFile)} type={state.audioFile.type} />
            </audio>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Audio preview appears after upload.</p>
        )}
      </Field>

      <Field>
        <Label htmlFor="cover-file">Cover Image (3000x3000)</Label>
        <Input
          id="cover-file"
          type="file"
          accept="image/*"
          onChange={(event) => state.setField("coverFile", event.target.files?.[0])}
        />
        {coverPreview ? (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <img src={coverPreview} alt="Cover preview" className="h-52 w-full object-cover" />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Square artwork, high contrast, no blur.</p>
        )}
      </Field>
    </div>
  );
}

function StepMetadata() {
  const state = useReleaseWizardStore();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field>
        <Label htmlFor="authors">Authors</Label>
        <Input
          id="authors"
          placeholder="Valeria Torres"
          value={state.authors}
          onChange={(event) => state.setField("authors", event.target.value)}
        />
      </Field>
      <Field>
        <Label htmlFor="composers">Composers</Label>
        <Input
          id="composers"
          placeholder="Valeria Torres, Max Reed"
          value={state.composers}
          onChange={(event) => state.setField("composers", event.target.value)}
        />
      </Field>
      <Field>
        <Label htmlFor="isrc">ISRC</Label>
        <Input
          id="isrc"
          placeholder="US-ICM-26-00001"
          value={state.isrc}
          onChange={(event) => state.setField("isrc", event.target.value)}
        />
      </Field>
      <Field>
        <Label htmlFor="upc">UPC</Label>
        <Input
          id="upc"
          placeholder="871234567890"
          value={state.upc}
          onChange={(event) => state.setField("upc", event.target.value)}
        />
      </Field>
      <Field className="md:col-span-2">
        <Label htmlFor="lyrics">Lyrics</Label>
        <Textarea
          id="lyrics"
          placeholder="Paste full lyrics if required"
          value={state.lyrics}
          onChange={(event) => state.setField("lyrics", event.target.value)}
        />
      </Field>
      <Field className="md:col-span-2">
        <Checkbox
          checked={state.explicitContent}
          onChange={(event) => state.setField("explicitContent", event.target.checked)}
          label="Contains explicit content"
        />
      </Field>
    </div>
  );
}

function StepPlatforms() {
  const state = useReleaseWizardStore();

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {platformList.map((platform) => (
        <div key={platform} className="rounded-xl border border-white/10 bg-black/20 p-3">
          <Checkbox
            checked={state.platforms[platform as keyof typeof state.platforms]}
            onChange={(event) =>
              state.setField("platforms", {
                ...state.platforms,
                [platform]: event.target.checked
              })
            }
            label={platform}
          />
        </div>
      ))}
    </div>
  );
}

function StepReview({ canSubmit }: { canSubmit: boolean }) {
  const state = useReleaseWizardStore();
  const selectedPlatforms = Object.entries(state.platforms)
    .filter((entry) => entry[1])
    .map((entry) => entry[0]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
        <p className="mb-2 font-medium text-white">Release summary</p>
        <div className="grid gap-2 text-muted-foreground md:grid-cols-2">
          <p>Title: {state.title || "-"}</p>
          <p>Artist: {state.artist || "-"}</p>
          <p>Type: {state.type.toUpperCase()}</p>
          <p>Release Date: {state.releaseDate || "-"}</p>
          <p>Genre: {state.genre || "-"}</p>
          <p>Language: {state.language || "-"}</p>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
        <p className="font-medium text-white">Distribution platforms</p>
        <p className="mt-2 text-muted-foreground">
          {selectedPlatforms.length > 0 ? selectedPlatforms.join(", ") : "No platforms selected."}
        </p>
      </div>

      <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-3 text-xs text-cyan-100">
        Validation ready: {canSubmit ? "all mandatory fields completed" : "please complete missing fields"}.
      </div>
    </div>
  );
}

function Field({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}
