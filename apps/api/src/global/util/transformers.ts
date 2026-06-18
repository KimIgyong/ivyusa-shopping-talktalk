import { ValueTransformer } from 'typeorm';

/** MySQL BIGINT comes back as string; coerce to JS number for app use. */
export const bigintTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};

/** DECIMAL comes back as string; coerce to number. */
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};
