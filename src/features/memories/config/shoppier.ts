/**
 * Where a buyer goes to purchase the digital frame product. Architecturally
 * prepared, not live-integrated: there is no real Shoppier product
 * configured yet, so this is empty by default — the write-up UI checks for
 * that and explains the product isn't available for purchase yet rather
 * than sending anyone to a broken link. Set SHOPPIER_PRODUCT_URL once a
 * real product exists.
 */
export const SHOPPIER_PRODUCT_URL = process.env.SHOPPIER_PRODUCT_URL || null;
