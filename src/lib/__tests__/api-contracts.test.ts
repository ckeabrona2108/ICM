import assert from "node:assert/strict";
import test from "node:test";

import type {
  AdminReleaseDecisionRequest,
  ModerationRemark,
  ReleaseSubmitRequest
} from "@/lib/api/contracts";

import { releaseSubmitRequestSchema } from "@/lib/release-policy";

test("ReleaseSubmitRequest supports extended moderation payload", () => {
  const payload: ReleaseSubmitRequest = {
    mode: "new",
    data: {
      cover: "data:image/png;base64,AAA",
      coverMeta: {
        mimeType: "image/png",
        sizeBytes: 1000,
        width: 1400,
        height: 1400,
        dpi: 72
      },
      language: "Русский",
      title: "Release",
      subtitle: "",
      genre: "Pop",
      subgenre: "Synth Pop",
      type: "single",
      releaseKind: "standard",
      label: "Label",
      persons: [{ name: "Artist", role: "Исполнитель" }],
      upc: "",
      partnerCode: "",
      rightsYear: "2026",
      preorderDate: "2026-04-01",
      startDate: "2026-04-07",
      releaseDate: "2026-04-01",
      territoryMode: "all",
      territoryCountries: [],
      platformMode: "all",
      platforms: [],
      tracks: [
        {
          fileName: "track.wav",
          title: "Track",
          metadataLanguage: "Русский",
          trackPersons: [{ name: "Artist", role: "Исполнитель" }]
        }
      ],
      moderatorComment: "",
      realTimeDelivery: false,
      yandexPreReleaseDate: "2026-03-31"
    }
  };

  const parsed = releaseSubmitRequestSchema.safeParse(payload);
  assert.equal(parsed.success, true);
});

test("AdminReleaseDecisionRequest remarks contract shape", () => {
  const remarks: ModerationRemark[] = [
    { field: "cover", message: "Fix cover", section: "Релиз" }
  ];

  const payload: AdminReleaseDecisionRequest = {
    releaseId: "rel_1",
    action: "request_changes",
    comment: "Need changes",
    remarks
  };

  assert.equal(payload.remarks?.[0].field, "cover");
  assert.equal(payload.remarks?.[0].message, "Fix cover");
});

test("AdminReleaseDecisionRequest supports reject action", () => {
  const payload: AdminReleaseDecisionRequest = {
    releaseId: "rel_2",
    action: "reject",
    comment: "Правообладатель не подтвержден."
  };

  assert.equal(payload.action, "reject");
});
