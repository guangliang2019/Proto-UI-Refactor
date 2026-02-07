import type { ProtoPhase, StyleHandle } from "@proto-ui/core";
import { illegalPhase } from "@proto-ui/core";
import { FeedbackStyleRecorder } from "@proto-ui/core";

import { createModule, defineModule, ModuleBase } from "@proto-ui/module-base";
import type { ModuleFactoryArgs } from "@proto-ui/module-base";

import type { FeedbackFacade, FeedbackModule } from "./types";
import { EFFECTS_CAP } from "./caps";

export function createFeedbackModule(ctx: ModuleFactoryArgs): FeedbackModule {
  const { init, caps, deps } = ctx;

  return createModule<"feedback", "instance", FeedbackFacade>({
    name: "feedback",
    scope: "instance",
    init,
    caps,
    deps,
    build: ({ init, caps }) => {
      class Impl extends ModuleBase {
        private recorder = new FeedbackStyleRecorder();
        private dirty = false;
        private flushRequested = false;

        /** setup-only */
        useStyle(handles: StyleHandle[]): () => void {
          // 用 sys 更精确；没 sys 时 fallback protoPhase
          const op = "def.feedback.style.use";
          this.sys?.ensureSetup(op);
          if (!this.sys && this.protoPhase !== "setup") {
            throw illegalPhase(op, this.protoPhase, {
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

          if (!this.caps.has(EFFECTS_CAP)) {
            this.defer(() => this.flushIfPossible());
            return;
          }

          const effects = this.caps.get(EFFECTS_CAP);
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
          // 这里是否要“无条件 push style”取决于你的 contract
          // 先按你原意：commit 后确保 host 拿到最新 style
          if (!this.caps.has(EFFECTS_CAP)) return;
          const effects = this.caps.get(EFFECTS_CAP);
          const merged = this.exportMerged();
          effects.queueStyle(merged);
          effects.requestFlush();
          this.flushRequested = true;
        }

        /** optional: runtime/adapter can call this after flush tick */
        onEffectsFlushed(): void {
          this.flushRequested = false;
          if (this.dirty && this.caps.has(EFFECTS_CAP)) {
            this.caps.get(EFFECTS_CAP).requestFlush();
            this.flushRequested = true;
          }
        }
      }

      const impl = new Impl(caps);

      const facade: FeedbackFacade = {
        style: {
          use: (...handles) => impl.useStyle(handles),
          exportMerged: () => impl.exportMerged(),
        },
      };

      return {
        facade,
        hooks: {
          onProtoPhase: (p: ProtoPhase) => impl.onProtoPhase(p),
          afterRenderCommit: () => impl.afterRenderCommit(),

          // 非 ModuleHooks 标准字段：先用 any 过渡
          // 后续你若要把它纳入统一的 module driver，就把它变成 port 或标准 hook
          flushIfPossible: () => impl.flushIfPossible(),
          onEffectsFlushed: () => impl.onEffectsFlushed(),
        } as any,
      };
    },
  });
}

export const FeedbackModuleDef = defineModule({
  name: "feedback",
  deps: [],
  create: createFeedbackModule,
});
