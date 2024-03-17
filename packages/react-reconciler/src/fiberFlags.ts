export type Flags = number;

export const NoFlags = 0b000000000000000000000000;
export const Placement = 0b000000000000000000000010;
export const Update = 0b000000000000000000000100;
export const ChildDeletion = 0b000000000000000000010000;

export const PassiveEffect = 0b000000000000000000100000;
export const Ref = 0b000000000000000001000000;
export const Visibility = 0b000000000000000010000000;
export const ShouldCapture = 0b000000000000000100000000;
export const DidCapture = 0b000000000000001000000000;

export const MutationMask =
	Placement | Update | ChildDeletion | Ref | Visibility;
export const LayoutMask = Ref;

export const PassiveMask = PassiveEffect | ChildDeletion;

export const HostEffectMask =
	MutationMask | LayoutMask | PassiveMask | DidCapture;
