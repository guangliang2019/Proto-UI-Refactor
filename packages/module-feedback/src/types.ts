import type { StyleHandle } from "@proto-ui/core";
import type { EffectsPort } from "@proto-ui/core";
import type {
  ModuleFacade,
  ModuleInternal,
  ModuleInit,
  ModuleInstance,
  ModuleScope,
  ProtoPhase,
} from "@proto-ui/core";
import type { CapsVaultView } from "@proto-ui/module-base";

export type FeedbackCaps = {
  effects: EffectsPort;
};

export interface FeedbackFacade extends ModuleFacade {
  style: {
    /** setup-only */
    use: (...handles: StyleHandle[]) => () => void;

    /** pure snapshot: allowed in any phase */
    exportMerged: () => StyleHandle;
  };
}

export interface FeedbackInternal extends ModuleInternal {
  onProtoPhase(phase: ProtoPhase): void;

  /** called by runtime or host to try applying effects */
  flushIfPossible(): void;

  /** optional hook: structural commit replaced DOM */
  afterRenderCommit(): void;
}

export type FeedbackModule = ModuleInstance<FeedbackFacade> & {
  name: "feedback";
  scope: ModuleScope;
};

export type CreateFeedbackModule = (
  init: ModuleInit,
  caps: CapsVaultView<FeedbackCaps>
) => FeedbackModule;
