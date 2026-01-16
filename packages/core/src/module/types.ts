export type ModuleScope = "instance" | "host" | "singleton";

export type ProtoPhase = "setup" | "mounted" | "updated" | "unmounted";

export type ModuleInit = {
  prototypeName: string;
  debugLabel?: string;
};

export interface ModuleFacade {
  // intentionally empty; modules define their own facade types
}

export interface ModuleInternal {
  // runtime orchestration SPI
  onProtoPhase?(phase: ProtoPhase): void;
  // optional: called by runtime after structural commit
  afterRenderCommit?(): void;
}

export interface ModuleInstance<
  F extends ModuleFacade,
  I extends ModuleInternal
> {
  readonly name: string;
  readonly scope: ModuleScope;
  readonly facade: F;
  readonly internal: I;
}
