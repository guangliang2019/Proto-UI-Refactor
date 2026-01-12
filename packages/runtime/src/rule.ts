// packages/runtime/src/rule.ts
import type { RuleIR, RuleSpec } from "@proto-ui/rule";
import { compileRule, evaluateRulesToPlan } from "@proto-ui/rule";

/**
 * v0: keep everything as any until generic story is settled.
 */
export class RuleRegistry {
  private rules: RuleIR<any>[] = [];

  define(spec: RuleSpec<any>) {
    const ir = compileRule<any>(spec as any);
    this.rules.push(ir);
  }

  exportIR(): RuleIR<any>[] {
    return this.rules.slice();
  }

  evaluateStyleTokens(props: any): string[] {
    const plan = evaluateRulesToPlan<any>(this.rules as any, props as any);
    if (plan.kind !== "style.tokens") return [];
    return plan.tokens;
  }
}
