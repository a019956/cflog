// Which store products count as coffee beans (used by the pipeline's store-JSON extractors).
import { normalizeText } from './vocab';

const COFFEE =
  /\b(coffee|coffees|beans?|single origins?|blend|espresso|decaf|roast|roasted|filter roast|omni roast|microlot|micro lot|natural process|washed process)\b/;
const NOT_BEANS =
  /\b(mugs?|tee|t shirt|shirt|hoodie|sweatshirt|hat|beanie|cap|tote|bag clip|apparel|merch|gear|grinder|kettle|filter papers?|paper filters?|dripper|brewer|chemex|v60|aeropress|french press|scale|gift cards?|giftcard|subscriptions?|subscribe|sticker|tumbler|equipment|accessor(y|ies)|chocolate bar|candle|pods?|capsules?|nespresso|k cups?|instant|concentrate|cans?|canned|drip bags?|syrup|workshop|gift box|gift set|bundle)\b/;
/** Product types that are never beans even when the title mentions coffee. */
const NOT_BEAN_TYPES =
  /\b(tea|teas|matcha|chai|merch|merchandise|apparel|equipment|gear|brewing|accessories|gift card|subscription)\b/;

export interface ProductLike {
  title: string;
  type?: string;
  tags?: readonly string[];
}

/** True when a store product looks like whole-bean/ground coffee (not merch, gear, tea or subscriptions). */
export function isCoffeeProduct(p: ProductLike): boolean {
  const title = normalizeText(p.title);
  const meta = normalizeText([p.type ?? '', ...(p.tags ?? [])].join(' '));
  if (NOT_BEANS.test(title)) return false;
  if (
    p.type &&
    (NOT_BEANS.test(normalizeText(p.type)) || NOT_BEAN_TYPES.test(normalizeText(p.type)))
  )
    return false;
  return (
    COFFEE.test(`${title} ${meta}`) ||
    /\b(ethiopia|kenya|colombia|guatemala|brazil|peru|honduras|rwanda|burundi|costa rica|el salvador|panama|mexico|nicaragua|sumatra|yemen|ecuador|bolivia|uganda|tanzania|congo)\b/.test(
      title,
    )
  );
}
