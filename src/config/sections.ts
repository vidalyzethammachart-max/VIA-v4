import type { Locale } from "../i18n/translations";

export type LikertValue = 1 | 2 | 3 | 4 | 5;

export type Question = {
  id: string;
  label: string;
  storageKey: string;
};

export type Section = {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
};

type LocalizedSection = Omit<Section, "questions"> & {
  questions: Array<{ id: string; th: string; en: string }>;
};

const SECTION_CONTENT: LocalizedSection[] = [
  {
    id: "1",
    title: "บทหรือสคริปต์",
    description: "ประเมินความชัดเจน เหมาะสม และลำดับการสื่อสารของบทพูดและเนื้อหา",
    questions: [
      { id: "q1", th: "ใช้ภาษาไม่ซับซ้อน และเข้าใจได้สำหรับกลุ่มเป้าหมาย", en: "Uses simple and audience-appropriate language." },
      { id: "q2", th: "แบ่งเนื้อหาออกเป็นส่วนย่อย ๆ ที่เกี่ยวข้องกับเรื่องหลัก", en: "Breaks content into smaller parts that stay connected to the main topic." },
      { id: "q3", th: "เขียนบทสนทนาตรงกับเนื้อหาและการพูดของผู้บรรยาย", en: "Aligns the script with the content and the narrator's delivery." },
      { id: "q4", th: "ความยาวแต่ละส่วนเหมาะสม ไม่ทำให้ผู้ชมเบื่อ", en: "Keeps each section at an appropriate length without losing attention." },
      { id: "q5", th: "มีการเปิดเรื่องที่น่าสนใจเพื่อดึงความสนใจของผู้เรียน", en: "Opens with an engaging introduction that captures learner interest." },
    ],
  },
  {
    id: "2",
    title: "มุมกล้องหรือระยะภาพ",
    description: "ประเมินการเลือกมุมภาพและระยะภาพให้สอดคล้องกับบริบทการเรียนรู้",
    questions: [
      { id: "q1", th: "มีการเลือกใช้มุมที่เป็นมุมมองเชิงบวกที่มีความเหมาะสมและน่าสนใจ", en: "Uses positive and appropriate camera angles that keep the presentation interesting." },
      { id: "q2", th: "มีเปลี่ยนแปลงการใช้มุมกล้องที่สามารถสร้างประสบการณ์การเรียนรู้แบบมีส่วนร่วม", en: "Varying camera angles help create a more engaging learning experience." },
      { id: "q3", th: "มีการใช้มุมกล้องที่เป็นสถานการณ์จริงสามารถที่ส่งเสริมให้ผู้เรียนได้ปฏิสัมพันธ์กับสิ่งต่าง ๆ อย่างถูกต้อง", en: "Uses realistic camera perspectives that support correct interaction with the environment or content." },
      { id: "q4", th: "มีการใช้มุมกล้องที่ถูกต้องส่งเสริมให้ผู้เรียนเกิดการเรียนรู้ข้อมูลอย่างชัดเจน", en: "Uses appropriate camera angles that make the information clear to learners." },
      { id: "q5", th: "ใช้มุมกล้องจากสถานที่ที่พิเศษเพื่อนำเสนอสถานที่ที่น่าสนใจและเรียนรู้เรื่องสิ่งแวดล้อม", en: "Uses special or distinctive camera viewpoints to highlight places and environmental context." },
    ],
  },
  {
    id: "3",
    title: "การจัดองค์ประกอบภาพ",
    description: "ประเมินการวางองค์ประกอบภาพให้เป็นระเบียบ ชัดเจน และนำสายตา",
    questions: [
      { id: "q1", th: "มีการใช้การจัดองค์ประกอบภาพแบบนำสายตา เพื่อช่วยให้ผู้เรียนนำทางไปยังข้อมูลที่สำคัญ", en: "Uses visual composition to guide the viewer toward important information." },
      { id: "q2", th: "การจัดองค์ประกอบภาพที่มีความเป็นระเบียบและชัดเจนช่วยให้ผู้เรียนเข้าใจการเรียนรู้ได้ง่ายขึ้น", en: "Organized and clear composition makes learning easier to understand." },
      { id: "q3", th: "การเปรียบเทียบขนาดขององค์ประกอบในภาพสามารถช่วยให้ผู้เรียนเห็นความสัมพันธ์ข้อมูลที่ดูสมดุลได้ง่ายขึ้น", en: "Uses relative scale within the frame to clarify relationships between elements." },
      { id: "q4", th: "การจัดวางองค์ประกอบภาพเพื่อให้มีความชัดเจนมีโครงสร้างและเน้นไปที่สิ่งสำคัญโดยใช้กฎสามส่วน", en: "Places elements clearly and structurally, emphasizing key content using composition principles such as the rule of thirds." },
      { id: "q5", th: "มีการจัดองค์ประกอบภาพมาใช้ที่หลากหลายเพื่อการสร้างประสบการณ์การเรียนรู้ที่ดีขึ้น", en: "Applies varied composition styles to improve the learning experience." },
    ],
  },
  {
    id: "4",
    title: "ผู้บรรยาย",
    description: "ประเมินบุคลิก น้ำเสียง และความสามารถในการสื่อสารของผู้บรรยาย",
    questions: [
      { id: "q1", th: "ผู้บรรยายควรสร้างความสนใจและความตื่นเต้นในการเรียนรู้เพื่อให้ผู้เรียนติดตามเนื้อหาได้ง่ายขึ้น", en: "The narrator captures interest and creates enthusiasm for learning." },
      { id: "q2", th: "ผู้บรรยายเป็นผู้สร้างประสบการณ์การเรียนรู้ที่น่าจดจำสำหรับกลุ่มผู้เรียนที่สื่อสารด้วย", en: "The narrator creates a memorable learning experience for the target audience." },
      { id: "q3", th: "ผู้บรรยายควรสนับสนุนและกระตุ้นให้ผู้เรียนมีความคิดสร้างสรรค์และมีความสามารถในการแก้ปัญหา", en: "The narrator encourages creativity and problem-solving." },
      { id: "q4", th: "มีการนำเสนอตัวอย่างและประสบการณ์จริงที่เกี่ยวข้องสามารถช่วยให้ผู้เรียนเข้าใจและยอมรับข้อมูลได้ง่ายขึ้น", en: "Uses relevant examples and real experiences to improve understanding." },
      { id: "q5", th: "ผู้บรรยายควรมีความสามารถในการใส่อารมณ์และแรงกดดันในเสียงพูดการดึงดูดความสนใจและสร้างความสนใจในเนื้อหา", en: "Uses vocal tone and emotional emphasis effectively to sustain attention." },
    ],
  },
  {
    id: "5",
    title: "การลำดับภาพ",
    description: "ประเมินการเรียงลำดับภาพและการเล่าเรื่องให้เข้าใจง่ายและต่อเนื่อง",
    questions: [
      { id: "q1", th: "มีการเรียบเรียงหรือการลำดับเหตุการณ์ สถานการณ์ สถานที่ ผู้บรรยาย สิ่งแวดล้อม และเวลาที่น่าสนใจ", en: "Sequences events, situations, locations, narrator, environment, and timing in an engaging way." },
      { id: "q2", th: "การลำดับภาพโดยเริ่มจากองค์ประกอบที่สร้างความเข้าใจเบื้องต้นและลำดับไปสู่รายละเอียดเพิ่มเติม", en: "Builds understanding from basic context toward deeper detail." },
      { id: "q3", th: "การเปรียบเทียบระหว่างภาพที่แสดงความแตกต่างหรือความเชื่อมโยงช่วยให้ผู้เรียนเข้าใจความสัมพันธ์ได้ง่ายขึ้น", en: "Uses comparison between images to show differences or connections clearly." },
      { id: "q4", th: "การลำดับภาพในรูปแบบของการสร้างเนื้อหาเรื่องราวของเหตุการณ์ให้เข้าใจได้ง่ายขึ้น", en: "Arranges images in a narrative sequence that makes the story easier to understand." },
      { id: "q5", th: "การลำดับภาพสอดคล้องกับเนื้อหาและวัตถุประสงค์การเรียนรู้ การใช้เทคนิคที่เหมาะสมและสร้างสรรค์", en: "Keeps image sequence aligned with the content and learning objectives using suitable and creative techniques." },
    ],
  },
  {
    id: "6",
    title: "ฉากและสถานที่",
    description: "ประเมินความเหมาะสมของฉากและสถานที่กับเนื้อหาและบรรยากาศ",
    questions: [
      { id: "q1", th: "สถานที่และการจัดฉากที่เกี่ยวข้องมีความสอดคล้องกับเนื้อหาการเรียนรู้", en: "The location and set design align with the learning content." },
      { id: "q2", th: "การจัดฉากและสถานที่ที่ไม่ซับซ้อนมากเกินไปและต้องไม่มีปัจจัยที่ส่งผลกระทบต่อการเรียนรู้", en: "The scene is not overly complex and avoids distractions that interfere with learning." },
      { id: "q3", th: "สถานที่และฉากสามารถสื่อสารที่อธิบายเนื้อหาได้อย่างชัดเจน", en: "The location and set clearly support explanation of the content." },
      { id: "q4", th: "สถานที่มีความสัมพันธ์กับเนื้อหาสามารถช่วยในการสื่อถึงความหมายที่ลึกซึ้ง", en: "The setting meaningfully relates to the content and adds depth." },
      { id: "q5", th: "มีการจัดฉากและสถานที่เหมาะสมเป็นการสร้างประสบการณ์การเรียนรู้ที่มีคุณค่าและสร้างสรรค์", en: "Uses appropriate sets and locations to create a valuable and creative learning experience." },
    ],
  },
  {
    id: "7",
    title: "การจัดแสง",
    description: "ประเมินการใช้แสงเพื่อเน้นเนื้อหา สร้างบรรยากาศ และความชัดเจนของภาพ",
    questions: [
      { id: "q1", th: "มีการปรับแสงให้เหมาะสมกับบริบทเนื้อหา", en: "Adjusts lighting appropriately for the content context." },
      { id: "q2", th: "มีการจัดแสงเป็นองค์ประกอบสำคัญเพื่อช่วยเพิ่มความน่าสนใจ", en: "Uses lighting as an important element to increase visual interest." },
      { id: "q3", th: "การใช้แสงถ่วงน้ำหนักเพื่อจะช่วยเน้นที่รายละเอียดหรือคุณสมบัติเฉพาะของวัตถุ", en: "Uses lighting emphasis to highlight details or specific features of the subject." },
      { id: "q4", th: "มีการจัดแสงในการถ่ายทำได้อย่างเป็นศิลปะในการสร้างเนื้อหาที่มีคุณภาพและมีความน่าสนใจ", en: "Uses artistic lighting to create high-quality and attractive content." },
      { id: "q5", th: "มีการจัดแสงในการสร้างสภาพแวดล้อมที่เหมาะสมเพื่อการเรียนรู้และการสื่อสารของเนื้อหา", en: "Uses lighting to create an environment suitable for learning and communication." },
    ],
  },
  {
    id: "8",
    title: "การใช้เสียง",
    description: "ประเมินคุณภาพ ความสมดุล และความเหมาะสมของเสียงประกอบและเสียงบรรยาย",
    questions: [
      { id: "q1", th: "มีการปรับระดับเสียงในแต่ละส่วนให้ความเสียงสมดุล", en: "Balances audio levels across different parts of the content." },
      { id: "q2", th: "มีการใช้เสียงที่เหมาะสมและมีคุณภาพสามารถช่วยสร้างประสบการณ์ที่เต็มเปี่ยมและน่าติดตาม", en: "Uses suitable, high-quality audio that makes the experience richer and more engaging." },
      { id: "q3", th: "มีสัมผัสเสียงกับภาพตรงกับการกระทำของบุคคลหรือสถานการณ์ที่เกิดขึ้น", en: "Keeps sound aligned with on-screen actions or situations." },
      { id: "q4", th: "มีการใช้เสียงที่เหมาะสมกับเนื้อหา", en: "Uses audio that matches the content." },
      { id: "q5", th: "เสียงบรรยายมีการออกเสียงพยัญชนะตามหลักการใช้ภาษาที่ถูกต้อง", en: "Narration pronunciation is clear and linguistically correct." },
    ],
  },
  {
    id: "9",
    title: "การออกแบบกราฟิก",
    description: "ประเมินการใช้กราฟิก สี ข้อความ และแอนิเมชันเพื่อสนับสนุนการเรียนรู้",
    questions: [
      { id: "q1", th: "มีการออกแบบกราฟิกได้อย่างสร้างสรรค์การเข้าใจถึงแก่นหลักของเรื่อง", en: "Graphic design is creative and captures the core idea of the topic." },
      { id: "q2", th: "เลือกสีเพื่อเน้นข้อมูลที่สำคัญที่เหมาะสม สอดคล้องกับเนื้อหาและบรรยากาศ อารมณ์และความรู้สึกของผู้เรียน", en: "Uses color appropriately to emphasize important information and match the content and mood." },
      { id: "q3", th: "เทคนิคการแสดงผลข้อความบนหน้าจอควรเลือกสไตล์ที่เหมาะสมกับเนื้อหาและกลุ่มเป้าหมาย", en: "On-screen text style is appropriate for the content and target audience." },
      { id: "q4", th: "การใช้แอนิเมชันช่วยในการเน้นจุดสำคัญและทำให้เนื้อหาดูน่าสนใจมากขึ้น", en: "Animation and editing help emphasize key points and make the content more engaging." },
      { id: "q5", th: "การรักษาระดับคุณภาพและสไตล์กราฟิกมีความสม่ำเสมอในทุก ๆ ส่วนเพื่อให้ผู้เรียนรู้สึกเป็นไปตามความคาดหวัง", en: "Maintains consistent graphic quality and style across all parts of the content." },
    ],
  },
];

const LIKERT_LABELS_BY_LOCALE: Record<Locale, Record<LikertValue, string>> = {
  th: {
    5: "ดีมาก",
    4: "ดี",
    3: "ปานกลาง",
    2: "พอใช้",
    1: "ควรปรับปรุง",
  },
  en: {
    5: "Excellent",
    4: "Good",
    3: "Average",
    2: "Fair",
    1: "Needs Improvement",
  },
};

export function getSections(locale: Locale): Section[] {
  return SECTION_CONTENT.map((section) => ({
    id: section.id,
    title: locale === "th" ? section.title : translateSectionTitle(section.id),
    description: locale === "th" ? section.description : translateSectionDescription(section.id),
    questions: section.questions.map((question) => ({
      id: question.id,
      label: locale === "th" ? question.th : question.en,
      storageKey: question.th,
    })),
  }));
}

export function getLikertLabels(locale: Locale): Record<LikertValue, string> {
  return LIKERT_LABELS_BY_LOCALE[locale];
}

function translateSectionTitle(id: string) {
  switch (id) {
    case "1":
      return "Language and Script";
    case "2":
      return "Camera Angle and Shot Distance";
    case "3":
      return "Composition";
    case "4":
      return "Narrator";
    case "5":
      return "Story Sequence";
    case "6":
      return "Scene and Location";
    case "7":
      return "Lighting";
    case "8":
      return "Audio";
    case "9":
      return "Graphics and Visual Design";
    default:
      return id;
  }
}

function translateSectionDescription(id: string) {
  switch (id) {
    case "1":
      return "Evaluate clarity, appropriateness, and structure of the spoken script and content flow.";
    case "2":
      return "Evaluate whether camera angle and framing support the learning context effectively.";
    case "3":
      return "Evaluate composition, clarity, structure, and visual guidance within the frame.";
    case "4":
      return "Evaluate the narrator's presence, delivery, and communication effectiveness.";
    case "5":
      return "Evaluate sequencing, continuity, and storytelling flow.";
    case "6":
      return "Evaluate how well scenes and locations support the content and atmosphere.";
    case "7":
      return "Evaluate lighting for clarity, emphasis, and mood.";
    case "8":
      return "Evaluate audio quality, balance, and suitability for the content.";
    case "9":
      return "Evaluate how graphics, color, text, and animation support learning.";
    default:
      return "";
  }
}
