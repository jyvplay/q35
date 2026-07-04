import { registerFlaws, registerFlawPack } from "../flaw-registry";
import { BUILTIN_DETECTORS } from "./builtins";
import { CRITIQUE_FIXERS } from "./fixers";
import { STATISTICS_FLAWS } from "./statistics";
import { STATISTICS_ADVANCED_FLAWS } from "./statistics-advanced";
import { SOFTWARE_EXTENDED_FLAWS } from "./software-extended";
import { SOFTWARE_RN_WEBGL_FLAWS } from "./software-rn-webgl";
import { MEDICAL_FLAWS } from "./medical";
import { LEGAL_FLAWS } from "./legal";
import { FINANCE_FLAWS } from "./finance";

let loaded = false;
export function ensureFlawsLoaded(): void {
  if (loaded) return;
  loaded = true;

  registerFlawPack("builtin", BUILTIN_DETECTORS);
  CRITIQUE_FIXERS();
  registerFlawPack("statistics", STATISTICS_FLAWS);
  registerFlawPack("statistics-advanced", STATISTICS_ADVANCED_FLAWS);
  registerFlawPack("software-extended", SOFTWARE_EXTENDED_FLAWS);
  registerFlawPack("software-rn-webgl", SOFTWARE_RN_WEBGL_FLAWS);
  registerFlawPack("medical", MEDICAL_FLAWS);
  registerFlawPack("legal", LEGAL_FLAWS);
  registerFlawPack("finance", FINANCE_FLAWS);
}

export {
  registerFlaw, registerFlaws, registerFlawPack,
  setFlawEnabled, setPackEnabled, listFlaws, listPacks,
  loadDeclarativePack, registryHealthCheck,
} from "../flaw-registry";
