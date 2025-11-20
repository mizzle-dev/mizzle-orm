/**
 * Type-level configuration encoding for field builders
 *
 * This file provides compile-time types that encode the configuration state
 * of field builders. By encoding config in the type system, TypeScript can
 * properly infer which fields are required/optional for insert operations.
 *
 * Key Concept:
 * Instead of relying on runtime mutations that TypeScript can't track,
 * we encode the field's configuration state directly in its type parameter.
 * Each builder method returns a new type that reflects the updated config.
 *
 * @example
 * ```typescript
 * // Without config encoding (current - doesn't work):
 * const field = date().defaultNow();
 * // TypeScript sees: DateFieldBuilder with _config: { defaultNow?: boolean }
 * // Can't determine if defaultNow is true or false
 *
 * // With config encoding (new - works perfectly):
 * const field = date().defaultNow();
 * // TypeScript sees: DateFieldBuilder<{ hasDefaultNow: true, hasDefault: true }>
 * // TypeScript knows this field has a default!
 * ```
 */

/**
 * Type-level configuration state for field builders
 *
 * This interface represents the compile-time knowledge of a field's
 * configuration. All properties use concrete boolean values (true)
 * rather than optional booleans (boolean | undefined) to enable
 * precise type checking.
 */
export interface FieldConfigState {
  // Nullability modifiers
  readonly optional?: true;
  readonly nullable?: true;

  // Auto-generation markers
  readonly isInternalId?: true;
  readonly isPublicId?: true;

  // Default value markers
  readonly hasDefault?: true;
  readonly hasDefaultNow?: true;
  readonly hasOnUpdateNow?: true;

  // Special field markers
  readonly isTenantKey?: true;
  readonly isOwnerKey?: true;
  readonly isSoftDeleteFlag?: true;
}

/**
 * Default empty configuration state
 * Represents a field with no special configuration
 * All properties in FieldConfigState are optional, so an empty object satisfies the constraint
 */
export type EmptyConfig = {};

/**
 * Merge two configuration states
 *
 * When a builder method is called (e.g., `.optional()`), we need to merge
 * the new config properties with the existing ones. This type performs
 * that merge at the type level.
 *
 * @example
 * ```typescript
 * type Base = { hasDefault: false };
 * type Update = { optional: true };
 * type Result = MergeConfig<Base, Update>;
 * // Result = { hasDefault: false; optional: true }
 * ```
 */
export type MergeConfig<
  TBase extends FieldConfigState,
  TUpdate extends Partial<FieldConfigState>,
> = {
  [K in keyof (TBase & TUpdate)]: K extends keyof TUpdate
    ? TUpdate[K]
    : K extends keyof TBase
      ? TBase[K]
      : never;
};

/**
 * Mark a field as optional
 * Sets the `optional` flag to true
 */
export type WithOptional<TConfig extends FieldConfigState> = MergeConfig<
  TConfig,
  { optional: true }
>;

/**
 * Mark a field as nullable
 * Sets the `nullable` flag to true
 */
export type WithNullable<TConfig extends FieldConfigState> = MergeConfig<
  TConfig,
  { nullable: true }
>;

/**
 * Mark a field as having a default value
 * Sets the `hasDefault` flag to true
 */
export type WithDefault<TConfig extends FieldConfigState> = MergeConfig<
  TConfig,
  { hasDefault: true }
>;

/**
 * Mark a field as having defaultNow()
 * Sets both `hasDefaultNow` and `hasDefault` to true
 */
export type WithDefaultNow<TConfig extends FieldConfigState> = MergeConfig<
  TConfig,
  { hasDefaultNow: true; hasDefault: true }
>;

/**
 * Mark a field as having onUpdateNow()
 * Sets the `hasOnUpdateNow` flag to true
 */
export type WithOnUpdateNow<TConfig extends FieldConfigState> = MergeConfig<
  TConfig,
  { hasOnUpdateNow: true }
>;

/**
 * Mark a field as an internal ID (like _id)
 * Sets the `isInternalId` flag to true
 */
export type WithInternalId<TConfig extends FieldConfigState> = MergeConfig<
  TConfig,
  { isInternalId: true }
>;

/**
 * Mark a field as a public ID
 * Sets the `isPublicId` flag to true
 */
export type WithPublicId<TConfig extends FieldConfigState> = MergeConfig<
  TConfig,
  { isPublicId: true }
>;

/**
 * Mark a field as a soft delete flag
 * Sets the `isSoftDeleteFlag` flag to true
 */
export type WithSoftDeleteFlag<TConfig extends FieldConfigState> = MergeConfig<
  TConfig,
  { isSoftDeleteFlag: true }
>;

/**
 * Mark a field as a tenant key
 * Sets the `isTenantKey` flag to true
 */
export type WithTenantKey<TConfig extends FieldConfigState> = MergeConfig<
  TConfig,
  { isTenantKey: true }
>;

/**
 * Mark a field as an owner key
 * Sets the `isOwnerKey` flag to true
 */
export type WithOwnerKey<TConfig extends FieldConfigState> = MergeConfig<
  TConfig,
  { isOwnerKey: true }
>;
