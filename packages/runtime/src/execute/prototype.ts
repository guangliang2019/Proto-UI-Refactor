import { Prototype } from "@proto-ui/core";
import { PropsBaseType } from "@proto-ui/types";
import { ExecuteOptions, ExecuteResult } from "./types";
import { createEngine } from "./engine";

/**
 * Pure in-memory executor (used by internal specimens).
 * Does not commit to any host.
 */
export function executePrototype<P extends PropsBaseType>(
  proto: Prototype<P>,
  opt: ExecuteOptions = {}
): ExecuteResult<P> {
  const engine = createEngine(proto, {
    initialRawProps: { ...(opt.props ?? {}) },
    allowRunUpdate: false,
  });

  const children = engine.renderOnce();

  return {
    children,
    lifecycle: engine.lifecycle,
    invoke: (kind) => engine.invoke(kind),
  };
}
