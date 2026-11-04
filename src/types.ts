export type Cleanup = () => void;

export type Equality<T = any> = (previous: T, next: T) => boolean;

export type NormalizedEquality<T> = Equality<T> | false | null;

export type EqualityConfig<T> = Equality<T> | false | null | undefined;

export type Setter<T = any> = (value: T) => void;

export type Owned<T> = T & {
  dispose(): void;
};
