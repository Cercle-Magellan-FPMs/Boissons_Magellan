import test from "node:test";
import assert from "node:assert/strict";
import { buildEpcPayload, validateUnstructuredRemittance } from "./qrCode.js";

test("rejects Belgian structured communication pattern", () => {
  assert.equal(validateUnstructuredRemittance("+++123/4567/89012+++"), false);
});

test("rejects EPC RF structured reference", () => {
  assert.equal(validateUnstructuredRemittance("RF18539007547034"), false);
});

test("accepts free remittance with Boisson + unique id", () => {
  assert.equal(validateUnstructuredRemittance("Boisson A1B2C3D4E5F6"), true);
});

test("writes free remittance in EPC unstructured field (line 11)", () => {
  const payload = buildEpcPayload(
    {
      recipient_name: "Cercle Magellan",
      iban: "BE70751211827125",
      bic: "NICABEBBXXX",
      remittance_prefix: "Boisson",
    },
    150,
    "A1B2C3D4E5F6"
  );
  const lines = payload.split("\n");

  assert.equal(lines[9], "");
  assert.equal(lines[10], "Boisson A1B2C3D4E5F6");
});
