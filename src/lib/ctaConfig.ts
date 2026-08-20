// Spintax वेरिएशन्स
export const GREETINGS = ["Hi,", "Hello,", "Hey,", "Hi there,"];

export const OPENERS = [
  "Hope you are having a productive week.",
  "Hope this note finds you well.",
  "Hope everything is going well on your end.",
  "Reaching out to quickly connect.",
];

export const SIGN_OFFS = [
  "Best regards,",
  "Thanks & regards,",
  "Warm regards,",
  "Best,",
  "Thanks,",
];

// 🎯 सर्विस कैटेगरी के हिसाब से 4-4 पॉजिटिव 'YES' Call-To-Action (CTA)
export const CTA_BY_CATEGORY: Record<string, string[]> = {
  WEB_DESIGN: [
    "Would you be open to a quick website redesign preview? Just hit reply with 'YES' and I'll send it over.",
    "Interested in seeing a quick mock-up for your site design? Simply reply 'YES' to take a look.",
    "Would you like to see how we could elevate your current site's layout? Just reply 'YES'.",
    "Curious to see a quick demo of our latest website projects? Just drop a 'YES' and let's connect.",
  ],
  MOBILE_APP: [
    "Would you be open to a quick app UI preview? Just hit reply with 'YES' and I'll send it over.",
    "Interested in seeing a demo of our recent mobile app work? Simply reply 'YES'.",
    "Would you like to see a quick conceptual mock-up for your app idea? Just reply 'YES'.",
    "Curious to see how we build high-performance apps? Just drop a 'YES' and let's connect.",
  ],
  SEO: [
    "Would you be open to a quick SEO ranking overview for your site? Just hit reply with 'YES'.",
    "Interested in seeing how we boost organic traffic for sites like yours? Simply reply 'YES'.",
    "Would you like a quick audit of your site's current search performance? Just reply 'YES'.",
    "Would you be open to seeing our strategy for getting top search positions? Just drop a 'YES'.",
  ],
  DIGITAL_MARKETING: [
    "Would you be open to a quick look at our high-conversion ad strategies? Just hit reply with 'YES'.",
    "Interested in seeing how we scale ROI for businesses in your industry? Simply reply 'YES'.",
    "Would you like a quick overview of our growth framework? Just reply 'YES'.",
    "Curious to see our latest results from similar marketing campaigns? Just drop a 'YES'.",
  ],
  CUSTOM_SOFTWARE: [
    "Would you be open to a quick overview of how we solve this technical challenge? Just hit reply with 'YES'.",
    "Interested in seeing a brief demo of our custom software approach? Simply reply 'YES'.",
    "Would you like to see how we build efficient, scalable custom solutions? Just reply 'YES'.",
    "Curious about how we could automate this process for your team? Just drop a 'YES'.",
  ],
  DEFAULT: [
    "Would you be open to a quick preview? Just hit reply with 'YES' and I'll send it right over.",
    "If you'd like to see a quick mock-up or sample, just reply 'YES' and I'll share it.",
    "Would you be interested in a quick 2-minute overview? Simply reply 'YES' and I'll send the details.",
    "Are you open to seeing how this could work for your business? Just reply 'YES' and I'll show you.",
  ],
};