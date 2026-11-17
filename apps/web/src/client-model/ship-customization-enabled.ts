/** A production build cannot opt into the unfinished ship UI. */
export const shipCustomizationEnabled =
  import.meta.env.DEV && import.meta.env.VITE_SHIP_CUSTOMIZATION === 'true'
