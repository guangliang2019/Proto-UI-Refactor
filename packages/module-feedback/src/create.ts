// packages/module-feedback/src/create.ts
// ✅ 改造：把 createFeedbackModule 从 (init, caps) 改成 ({ init, caps })

import type { StyleHandle, ModuleInit, ProtoPhase } from "@proto-ui/core";
import { illegalPhase } from "@proto-ui/core";
import {
  createModule,
  ModuleBase,
  type ModuleFactoryArgs,
} from "@proto-ui/module-base";
import type { CapsVaultView, WithSystemCaps } from "@proto-ui/module-base";
import type { FeedbackCaps, FeedbackFacade, FeedbackModule } from "./types";
import { FeedbackStyleRecorder } from "@proto-ui/core";

export function createFeedbackModule(
  ctx: ModuleFactoryArgs<FeedbackCaps>
): FeedbackModule {
  const { init, caps } = ctx;

  return createModule<"feedback", "instance", FeedbackCaps, FeedbackFacade>({
    name: "feedback",
    scope: "instance",
    init,
    caps,
    build: ({ init, caps }) => {
      class Impl extends ModuleBase<FeedbackCaps> {
        private recorder = new FeedbackStyleRecorder();
        private dirty = false;
        private flushRequested = false;

        constructor(caps: CapsVaultView<FeedbackCaps & WithSystemCaps>) {
          super(caps);
        }

        /** setup-only */
        useStyle(handles: StyleHandle[]): () => void {
          if (this.protoPhase !== "setup") {
            throw illegalPhase("def.feedback.style.use", this.protoPhase, {
              prototypeName: init.prototypeName,
              hint: `Use 'run' inside runtime callbacks, not 'def'.`,
            });
          }

          const unUse = this.recorder.use(...handles);
          this.dirty = true;

          return () => {
            unUse();
            this.dirty = true;
          };
        }

        /** pure snapshot */
        exportMerged(): StyleHandle {
          const { tokens } = this.recorder.export();
          return { kind: "tw", tokens };
        }

        override onProtoPhase(phase: ProtoPhase): void {
          super.onProtoPhase(phase);
          if (phase === "mounted") this.flushIfPossible();
        }

        protected override onCapsEpoch(_epoch: number): void {
          this.flushIfPossible();
        }

        flushIfPossible(): void {
          if (this.protoPhase === "setup") return;
          if (!this.dirty) return;

          if (!this.caps.has("effects")) {
            this.defer(() => this.flushIfPossible());
            return;
          }

          const effects = this.caps.get("effects");
          const merged = this.exportMerged();

          // mark clean before calling host
          this.dirty = false;

          effects.queueStyle(merged);

          if (!this.flushRequested) {
            this.flushRequested = true;
            effects.requestFlush();
          }
        }

        afterRenderCommit(): void {
          if (!this.caps.has("effects")) return;
          const effects = this.caps.get("effects");
          const merged = this.exportMerged();
          effects.queueStyle(merged);
          effects.requestFlush();
          this.flushRequested = true;
        }

        /** optional: runtime/adapter can call this after flush tick */
        onEffectsFlushed(): void {
          this.flushRequested = false;
          if (this.dirty && this.caps.has("effects")) {
            this.caps.get("effects").requestFlush();
            this.flushRequested = true;
          }
        }
      }

      const impl = new Impl(caps);

      return {
        facade: {
          style: {
            use: (...handles) => impl.useStyle(handles),
            exportMerged: () => impl.exportMerged(),
          },
        },
        hooks: {
          onProtoPhase: (p) => impl.onProtoPhase(p),
          flushIfPossible: () => impl.flushIfPossible(),
          afterRenderCommit: () => impl.afterRenderCommit(),
        },
      };
    },
  });
}
