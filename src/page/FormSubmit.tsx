import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import MainNavbar from "../components/MainNavbar";
import { SectionCard } from "../components/SectionCard";
import { getLikertLabels, getSections, type LikertValue } from "../config/sections";
import { useLanguage } from "../i18n/useLanguage";
import { normalizeRole, type AppRole } from "../lib/roles";
import { supabase } from "../lib/supabaseClient";
import { roleRequestService } from "../services/roleRequestService";
import { resolveVideoCaseMembership } from "../services/videoCaseService";
import { buildVideoCaseKey } from "../services/videoCaseIdentity";
import type { EvaluationPayload, Rubric } from "../services/evaluationService";

const MAX_VIDEO_SIZE_BYTES = 1024 * 1024 * 1024;
const MAX_LEGACY_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;

const VIDEO_UPLOAD_API_URL = import.meta.env.VITE_UPLOAD_VIDEO_API_URL;
const VIDEO_UPLOAD_MODE = (import.meta.env.VITE_VIDEO_UPLOAD_MODE || "r2").toLowerCase();
const IS_LEGACY_UPLOAD_MODE = VIDEO_UPLOAD_MODE === "legacy";

type N8nRubricItem = {
  key: string;
  name: string;
  scores: number[];
};

type N8nEvaluationPayload = {
  evaluation_id: number;
  created_by: string;
  employee_number?: string;
  order_number: string;
  subjectName: string;
  email?: string;
  rubric: N8nRubricItem[];
  suggestions: string[];
  overallSuggestionRaw: string;
  hasVideo: boolean;
  video?: R2UploadedVideo;
};

type SubmissionProgress = {
  percent: number;
  label: string;
};

type R2PresignResponse = {
  provider: "cloudflare-r2";
  bucket: string;
  objectKey: string;
  uploadUrl: string;
  downloadUrl: string;
  uploadExpiresIn: number;
  downloadExpiresIn: number;
};

type R2UploadedVideo = {
  provider: "cloudflare-r2";
  bucket: string;
  objectKey: string;
  downloadUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
};

const N8N_RUBRIC_SECTIONS: Record<string, { key: string; name: string }> = {
  "1": { key: "language_and_script", name: "Language & Script" },
  "2": { key: "camera_angle", name: "Camera Angle" },
  "3": { key: "composition", name: "Composition" },
  "4": { key: "narrator", name: "Narrator" },
  "5": { key: "story_sequence", name: "Story Sequence" },
  "6": { key: "scene_and_location", name: "Scene & Location" },
  "7": { key: "lighting", name: "Lighting" },
  "8": { key: "audio", name: "Audio" },
  "9": { key: "graphics_and_visuals", name: "Graphics & Visuals" },
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function validateVideoFile(file: File | null) {
  if (!file) return "กรุณาเลือกไฟล์วิดีโอก่อนส่งแบบประเมิน";
  const fileName = file.name.toLowerCase();
  const isSupportedVideo = fileName.endsWith(".mp4") || fileName.endsWith(".m4v");
  if (!isSupportedVideo) return "รองรับเฉพาะไฟล์ MP4 หรือ M4V";
  const maxVideoSize = IS_LEGACY_UPLOAD_MODE ? MAX_LEGACY_VIDEO_SIZE_BYTES : MAX_VIDEO_SIZE_BYTES;
  if (file.size > maxVideoSize) {
    return IS_LEGACY_UPLOAD_MODE
      ? "ไฟล์วิดีโอต้องมีขนาดไม่เกิน 500MB ในโหมด legacy"
      : "ไฟล์วิดีโอต้องมีขนาดไม่เกิน 1GB";
  }
  return null;
}
function normalizeScore(value: unknown): number {
  const n = Math.round(Number(value || 0));
  return n >= 1 && n <= 5 ? n : 0;
}

function getR2PresignUrl() {
  const uploadUrl = new URL(VIDEO_UPLOAD_API_URL, window.location.origin);
  uploadUrl.pathname = "/api/r2-presign-upload";
  uploadUrl.search = "";
  return uploadUrl.toString();
}

function readJsonError(responseText: string) {
  if (!responseText) {
    return "";
  }

  try {
    const payload = JSON.parse(responseText) as {
      error?: unknown;
      message?: unknown;
    };
    if (typeof payload.error === "string" && payload.error) {
      return payload.error;
    }
    if (typeof payload.message === "string" && payload.message) {
      return payload.message;
    }
  } catch {
    // Fall back to returning the raw response text below.
  }

  return responseText;
}

function assertR2PresignResponse(value: R2PresignResponse) {
  if (
    value.provider !== "cloudflare-r2" ||
    !value.uploadUrl ||
    !value.downloadUrl ||
    !value.objectKey
  ) {
    throw new Error("R2 upload URL request returned an incomplete response.");
  }
}

function createSubmissionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildVideoCaseDisplayLabel(orderNumber: string, subjectName: string) {
  const orderPart = orderNumber.trim();
  const subjectPart = subjectName.trim();

  if (!orderPart || !subjectPart) {
    return "";
  }

  return `${orderPart}-${subjectPart}`;
}

function FormSubmit() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, t } = useLanguage();
  const sections = getSections(language);
  const likertLabels = getLikertLabels(language);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const legacyVideoCaseUi = language === "th"
    ? {
        title: "à¸à¸¥à¸¸à¹ˆà¸¡à¸§à¸´à¸”à¸µà¹‚à¸­",
        description: "à¸£à¸°à¸šà¸šà¸ˆà¸°à¸ªà¸£à¹‰à¸²à¸‡à¸£à¸«à¸±à¸ªà¹€à¸„à¸ªà¸ˆà¸²à¸à¹€à¸¥à¸‚à¸—à¸µà¹ˆà¸ªà¸±à¹ˆà¸‡à¸‡à¸²à¸™ à¸Šà¸·à¹ˆà¸­à¸«à¸±à¸§à¸‚à¹‰à¸­ à¹à¸¥à¸°à¸£à¸«à¸±à¸ªà¸ªà¸±à¹‰à¸™à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´",
        keyLabel: "à¸£à¸«à¸±à¸ªà¸à¸¥à¸¸à¹ˆà¸¡à¸§à¸´à¸”à¸µà¹‚à¸­",
        keyPlaceholder: "à¹€à¸Šà¹ˆà¸™ video-001",
        leaderLabel: "à¸‰à¸±à¸™à¹€à¸›à¹‡à¸™à¸«à¸±à¸§à¸«à¸™à¹‰à¸²à¸Šà¸¸à¸”à¸™à¸µà¹‰",
        leaderDescription: "à¸–à¹‰à¸²à¹€à¸„à¸ªà¸™à¸µà¹‰à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸«à¸±à¸§à¸«à¸™à¹‰à¸² à¸„à¸¸à¸“à¸ªà¸²à¸¡à¸²à¸£à¸–à¸£à¸±à¸šà¸šà¸—à¸«à¸±à¸§à¸«à¸™à¹‰à¸²à¹„à¸”à¹‰",
        keyRequired: "à¸à¸£à¸¸à¸“à¸²à¸£à¸°à¸šà¸¸à¹€à¸¥à¸‚à¸—à¸µà¹ˆà¸ªà¸±à¹ˆà¸‡à¸‡à¸²à¸™à¹à¸¥à¸°à¸Šà¸·à¹ˆà¸­à¸«à¸±à¸§à¸‚à¹‰à¸­",
        analyzing: "à¸à¸³à¸¥à¸±à¸‡à¸§à¸´à¹€à¸„à¸£à¸²à¸°à¸«à¹Œà¸§à¸´à¸”à¸µà¹‚à¸­",
      }
    : {
        title: "Video case",
        description: "Enter the order number and subject name, then the system will generate the case key automatically.",
        keyLabel: "Video case key (auto-generated)",
        keyPlaceholder: "e.g. 001-Test",
        leaderLabel: "I am the case leader",
        leaderDescription: "If the case has no leader yet, you can claim the role.",
        keyRequired: "Please enter an order number and a subject name.",
        analyzing: "Analyzing video",
      };
  void legacyVideoCaseUi;
  const videoCaseUi = language === "th"
    ? {
        title: "กลุ่มวิดีโอ",
        description: "ระบบจะสร้างเคสจากเลขที่สั่งงานและชื่อหัวข้อโดยอัตโนมัติ เพื่อให้หลายคนประเมินงานเดียวกันได้",
        keyLabel: "Video Case",
        keyPlaceholder: "รอกรอกเลขที่สั่งงานและชื่อหัวข้อ",
        leaderLabel: "ฉันเป็นหัวหน้าเคสนี้",
        leaderDescription: "หัวหน้าเคสสามารถรวมผลของผู้ประเมินทุกคนและสั่งให้ AI วิเคราะห์ใหม่ได้",
        keyRequired: "กรุณาระบุเลขที่สั่งงานและชื่อหัวข้อ",
        analyzing: "กำลังวิเคราะห์วิดีโอ",
      }
    : {
        title: "Video case",
        description: "The case is generated automatically from the order number and subject name so multiple people can review the same work.",
        keyLabel: "Video Case",
        keyPlaceholder: "Waiting for an order number and subject name",
        leaderLabel: "I am the case leader",
        leaderDescription: "The case leader can combine all reviewers' results and ask AI to analyze them again.",
        keyRequired: "Please enter an order number and a subject name.",
        analyzing: "Analyzing video",
      };
  const videoCaseId = new URLSearchParams(location.search).get("caseId") || null;
  const showLegacyCaseSummary = new URLSearchParams(location.search).has("legacyCaseSummary");

  const [orderNumber, setOrderNumber] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [answers, setAnswers] = useState<
    Record<string, Record<string, LikertValue | undefined>>
  >({});
  const [comment, setComment] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<AppRole>("user");
  const [employeeNumber, setEmployeeNumber] = useState<string | null>(null);
  const [isRequestingRole, setIsRequestingRole] = useState(false);
  const [roleRequestMessage, setRoleRequestMessage] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const submittingRef = useRef(false);
  const [submissionMode, setSubmissionMode] = useState<"data_only" | "with_video">("data_only");
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [submissionProgress, setSubmissionProgress] = useState<SubmissionProgress | null>(null);
  const [loadedCaseId, setLoadedCaseId] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        return;
      }

      setUserEmail(user.email ?? null);
      setAuthUserId(user.id);

      void supabase
        .from("user_information")
        .select("role, employee_number")
        .eq("auth_user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          setUserRole(normalizeRole(data?.role));
          setEmployeeNumber(data?.employee_number ?? null);
        });
    });

  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadedCaseId(null);
    if (!videoCaseId) return;
    void supabase.from("video_cases").select("id, order_number, subject_name, deleted_at")
      .eq("id", videoCaseId).maybeSingle().then(({ data, error }) => {
        if (cancelled) return;
        if (data?.deleted_at) {
          setSubmitErrorMessage("เคสนี้อยู่ในถังขยะ กรุณาให้ผู้สร้างเคสหรือแอดมินกู้คืนก่อนส่งประเมิน");
          return;
        }
        if (error || !data?.order_number || !data?.subject_name) {
          setSubmitErrorMessage("โหลดข้อมูลเคสไม่สำเร็จ กรุณาเลือกเคสอีกครั้ง");
          return;
        }
        setOrderNumber(data.order_number);
        setSubjectName(data.subject_name);
        setLoadedCaseId(data.id);
      });
    return () => { cancelled = true; };
  }, [videoCaseId]);

  const handleToggleAnswer = (
    sectionId: string,
    questionId: string,
    value: LikertValue,
  ) => {
    setAnswers((prev) => {
      const sectionAnswers = prev[sectionId] || {};
      const current = sectionAnswers[questionId];
      const nextValue = current === value ? undefined : value;

      return {
        ...prev,
        [sectionId]: {
          ...sectionAnswers,
          [questionId]: nextValue,
        },
      };
    });
  };

  const buildRubric = (): Rubric => {
    const rubric: Rubric = {};

    sections.forEach((section) => {
      const sectionAnswers = answers[section.id] ?? {};
      rubric[section.id] = {};

      section.questions.forEach((question) => {
        const value = sectionAnswers[question.id];
        rubric[section.id][question.id] = typeof value === "number" ? value : null;
      });
    });

    return rubric;
  };

  const validateForm = useCallback((): string | null => {
    if (videoCaseId && loadedCaseId !== videoCaseId) return "กรุณารอโหลดข้อมูลเคสให้เรียบร้อยก่อนส่ง";
    if (!authUserId) {
      return t("form.sessionNotReady");
    }

    if (!orderNumber.trim()) {
      return t("form.fillOrderNumber");
    }

    if (!subjectName.trim()) {
      return t("form.fillSubjectName");
    }

    for (const section of sections) {
      const sectionAnswers = answers[section.id] ?? {};

      for (const question of section.questions) {
        const value = sectionAnswers[question.id];
        if (typeof value !== "number") {
          return t("form.fillAllRubric", { section: section.title });
        }
      }
    }

    if (!comment.trim()) {
      return t("form.fillOverallSuggestion");
    }

    if (submissionMode === "with_video") {
      if (!VIDEO_UPLOAD_API_URL) {
        return "ยังไม่ได้ตั้งค่า VITE_UPLOAD_VIDEO_API_URL สำหรับอัปโหลดวิดีโอ";
      }
      const videoError = validateVideoFile(selectedVideoFile);
      if (videoError) {
        return videoError;
      }

    }

    return null;
  }, [videoCaseId, loadedCaseId, authUserId, orderNumber, subjectName, sections, answers, comment, submissionMode, selectedVideoFile, t]);

  const buildPayload = (): EvaluationPayload | null => {
    if (!authUserId) {
      return null;
    }

    return {
      user_id: authUserId,
      order_number: orderNumber.trim(),
      subject_name: subjectName.trim(),
      overall_suggestion: comment.trim(),
      rubric: buildRubric(),
      Email: userEmail || undefined,
      video_case_id: videoCaseId || undefined,
    };
  };

  const resetForm = () => {
    setOrderNumber("");
    setSubjectName("");
    setAnswers({});
    setComment("");
    setSelectedVideoFile(null);
    setSubmissionMode("data_only");
    setShowValidation(false);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const isOrderNumberInvalid = showValidation && !orderNumber.trim();
  const isSubjectNameInvalid = showValidation && !subjectName.trim();
  const isCommentInvalid = showValidation && !comment.trim();
  const isVideoInvalid =
    showValidation &&
    submissionMode === "with_video" &&
    Boolean(validateVideoFile(selectedVideoFile));
  const generatedCaseKey = buildVideoCaseKey(orderNumber, subjectName);
  const displayCaseLabel = buildVideoCaseDisplayLabel(orderNumber, subjectName);

  useEffect(() => {
    if (!showValidation) {
      return;
    }

    setSubmitErrorMessage(validateForm());
  }, [
    authUserId,
    orderNumber,
    subjectName,
    answers,
    comment,
    submissionMode,
    selectedVideoFile,
    showValidation,
    language,
    validateForm,
  ]);

  const handleSubmissionModeChange = (mode: "data_only" | "with_video") => {
    setSubmissionMode(mode);
    if (mode === "data_only") {
      setSelectedVideoFile(null);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
    if (showValidation) {
      setSubmitErrorMessage(null);
    }
  };

  const handleVideoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedVideoFile(file);
    if (showValidation) {
      setSubmitErrorMessage(file ? validateVideoFile(file) : validateVideoFile(null));
    }
  };

  const saveEvaluation = async (
    payload: EvaluationPayload,
    options: {
      videoCaseId: string | null;
      analysisAiModel: string | null;
      analysisAiOutput: Record<string, unknown> | null;
      analysisAiRawText: string | null;
    },
  ) => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error(t("form.sessionNotReady"));
    }

    const { data, error } = await supabase
      .from("evaluations")
      .insert([
        {
          user_id: user.id,
          video_case_id: options.videoCaseId,
          order_number: payload.order_number ?? null,
          subject_name: payload.subject_name,
          overall_suggestion: payload.overall_suggestion ?? null,
          rubric: payload.rubric,
          analysis_kind: "human",
          analysis_ai_model: options.analysisAiModel,
          analysis_ai_output: options.analysisAiOutput,
          analysis_ai_raw_text: options.analysisAiRawText,
          document_status: "pending",
          document_error: null,
        },
      ])
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message || t("form.submitFailed"));
    }

    return data.id as number;
  };

  const buildN8nPayload = (
    payload: EvaluationPayload,
    evaluationId: number,
    hasVideo: boolean,
    video?: R2UploadedVideo,
  ): N8nEvaluationPayload[] => {
    const overallSuggestionRaw = payload.overall_suggestion?.trim() || "";

    return [
      {
        evaluation_id: evaluationId,
        created_by: authUserId || payload.user_id,
        employee_number: employeeNumber || undefined,
        order_number: payload.order_number || "",
        subjectName: payload.subject_name,
        email: payload.Email || undefined,
        rubric: sections.map((section) => {
          const rubricMeta = N8N_RUBRIC_SECTIONS[section.id];
          const sectionAnswers = answers[section.id] ?? {};

          return {
            key: rubricMeta.key,
            name: rubricMeta.name,
            scores: section.questions.map((question) =>
              normalizeScore(sectionAnswers[question.id]),
            ),
          };
        }),
        suggestions: overallSuggestionRaw ? [overallSuggestionRaw] : [],
        overallSuggestionRaw,
        hasVideo,
        video,
      },
    ];
  };

  const createR2Presign = async (
    videoFile: File,
    evaluationId: number | string,
  ): Promise<R2PresignResponse> => {
    const response = await fetch(getR2PresignUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileName: videoFile.name,
        mimeType: videoFile.type || "application/octet-stream",
        fileSize: videoFile.size,
        userId: authUserId,
        evaluationId,
      }),
    });

    const responseText = await response.text().catch(() => "");
    if (!response.ok) {
      const detail = readJsonError(responseText);
      throw new Error(
        `R2 upload URL request failed: ${response.status}${detail ? ` ${detail}` : ""}`,
      );
    }

    try {
      const presign = JSON.parse(responseText) as R2PresignResponse;
      assertR2PresignResponse(presign);
      return presign;
    } catch {
      throw new Error("Upload URL request returned an invalid response.");
    }
  };

  const uploadVideoToR2 = async (
    videoFile: File,
    recordId: number | string,
    onUploadProgress?: (percent: number) => void,
  ): Promise<R2UploadedVideo> => {
    const presign = await createR2Presign(videoFile, recordId);

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.open("PUT", presign.uploadUrl);
      xhr.setRequestHeader("Content-Type", videoFile.type || "application/octet-stream");

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          return;
        }

        onUploadProgress?.(Math.round((event.loaded / event.total) * 100));
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }

        reject(new Error(`R2 direct upload failed: ${xhr.status} ${xhr.responseText}`));
      };

      xhr.onerror = () => reject(new Error("R2 direct upload failed. Check bucket CORS and the signed upload URL."));
      xhr.onabort = () => reject(new Error("R2 direct upload was cancelled."));
      xhr.send(videoFile);
    });

    return {
      provider: presign.provider,
      bucket: presign.bucket,
      objectKey: presign.objectKey,
      downloadUrl: presign.downloadUrl,
      fileName: videoFile.name,
      mimeType: videoFile.type || "application/octet-stream",
      fileSize: videoFile.size,
    };
  };

  const sendEvaluationToN8n = async (
    webhookPayload: N8nEvaluationPayload[],
    videoFile?: File | null,
    evaluationId?: number,
    onUploadProgress?: (percent: number) => void,
    preUploadedVideo?: R2UploadedVideo | null,
  ) => {
    if (IS_LEGACY_UPLOAD_MODE && videoFile) throw new Error("Video processing requires R2 upload mode.");
    const uploadedVideo = videoFile ? preUploadedVideo || await uploadVideoToR2(videoFile, evaluationId || "pending", onUploadProgress) : null;
    const body = uploadedVideo ? webhookPayload.map(item => ({ ...item, hasVideo:true, video:uploadedVideo })) : webhookPayload;
    const { data, error } = await supabase.functions.invoke("forward-to-n8n", { body });
    if (error || !data?.ok) throw new Error(data?.error || error?.message || "Could not start evaluation processing.");
    return data;
  };

  const submitForm = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitErrorMessage(null);
    setSubmitSuccessMessage(null);
    setSubmissionProgress({
      percent: 5,
      label: t("form.progressPreparing"),
    });

    setIsSaving(true);

    const payload = buildPayload();
    if (!payload) {
      setSubmitErrorMessage(t("form.sessionNotReady"));
      setSubmissionProgress(null);
      submittingRef.current = false;
      setIsSaving(false);
      return;
    }

    let savedEvaluationId: number | null = null;
    try {
      const submissionId = createSubmissionId();
      const videoFile = submissionMode === "with_video" ? selectedVideoFile : null;
      let videoCaseId: string | null = null;
      let uploadedVideo: R2UploadedVideo | null = null;


      if (submissionMode === "with_video") {
        if (!videoFile) {
          setSubmitErrorMessage(validateVideoFile(videoFile));
          setSubmissionProgress(null);
          return;
        }
      }

      setSubmissionProgress({
        percent: 10,
        label: t("form.progressSaving"),
      });

      if (generatedCaseKey) {
        const resolvedCase = await resolveVideoCaseMembership({
          orderNumber: orderNumber.trim(),
          subjectName: subjectName.trim(),
          videoCaseId: loadedCaseId ?? undefined,
          caseTitle: subjectName.trim() || generatedCaseKey,
          sourceFileName: videoFile?.name ?? null,
          videoObjectKey: null,
          memberRole: "member",
        });

        videoCaseId = resolvedCase.id;
      }

      setSubmissionProgress({
        percent: 20,
        label: videoFile ? t("form.progressUploading") : t("form.progressSaving"),
      });

      if (videoFile) {
        uploadedVideo = await uploadVideoToR2(videoFile, submissionId, (uploadPercent) => {
          const mappedPercent = IS_LEGACY_UPLOAD_MODE
            ? Math.min(uploadPercent, 90)
            : 20 + Math.round(uploadPercent * 0.45);

          setSubmissionProgress({
            percent: Math.min(mappedPercent, 90),
            label: t("form.progressUploading"),
          });
        });

        await resolveVideoCaseMembership({
          orderNumber: orderNumber.trim(),
          subjectName: subjectName.trim(),
          videoCaseId: videoCaseId ?? undefined,
          caseTitle: subjectName.trim() || generatedCaseKey,
          sourceFileName: uploadedVideo.fileName,
          videoObjectKey: uploadedVideo.objectKey,
          memberRole: "member",
        });

        setSubmissionProgress({
          percent: 66,
        label: videoCaseUi.analyzing,
        });

        // Video AI starts in n8n immediately after upload and document dispatch.

      }

      const evaluationId = await saveEvaluation(payload, {
        videoCaseId,
        analysisAiModel: null,
        analysisAiOutput: null,
        analysisAiRawText: null,
      });

      savedEvaluationId = evaluationId;
      setSubmissionProgress({
        percent: 78,
        label: t("form.progressSending"),
      });

      await sendEvaluationToN8n(
        buildN8nPayload(payload, evaluationId, Boolean(videoFile)),
        videoFile,
        evaluationId,
        (uploadPercent) => {
          const mappedPercent = IS_LEGACY_UPLOAD_MODE
            ? Math.min(uploadPercent, 90)
            : 20 + Math.round(uploadPercent * 0.7);

          setSubmissionProgress({
            percent: Math.min(mappedPercent, 90),
            label: t("form.progressUploading"),
          });
        },
        uploadedVideo,
      );

      setSubmissionProgress({
        percent: 95,
        label: t("form.progressProcessing"),
      });

      resetForm();
      navigate("/my-forms", {
        replace: true,
        state: { generated: true, evaluationId, submissionId },
      });
    } catch (error) {
      console.error("Error while saving:", error);
      if (savedEvaluationId) {
        // Keep the saved identity visible; submitting the entire form again would
        // create a second evaluation rather than retry this document.
        navigate(`/preview/${savedEvaluationId}`, { replace: true, state: {
          dispatchError: error instanceof Error ? error.message : t("form.submitFailed"),
        } });
      } else {
        setSubmitErrorMessage(error instanceof Error ? error.message : t("form.submitFailed"));
      }
      setSubmissionProgress(null);
    } finally {
      submittingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setShowValidation(true);
      setSubmitErrorMessage(validationError);
      setSubmitSuccessMessage(null);
      return;
    }

    void submitForm();
  };

  const handleRequestEditorRole = async () => {
    if (!authUserId) {
      return;
    }

    setIsRequestingRole(true);
    setRoleRequestMessage(null);

    try {
      await roleRequestService.requestRole("editor");
      setRoleRequestMessage(t("form.requestSubmitted"));
    } catch (requestError: unknown) {
      setRoleRequestMessage(
        requestError instanceof Error ? requestError.message : t("form.requestFailed"),
      );
    } finally {
      setIsRequestingRole(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />
      <main className="mx-auto max-w-5xl px-4 py-6 md:py-8">
        {userRole === "user" && (
          <section className="ui-hover-card mb-6 rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
            <h2 className="text-sm font-semibold text-slate-900">{t("form.needEditorTitle")}</h2>
            <p className="mt-1 text-xs text-slate-500">{t("form.needEditorDescription")}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleRequestEditorRole}
                disabled={isRequestingRole}
                className="btn-primary disabled:bg-slate-400"
              >
                {isRequestingRole ? t("form.requestSubmitting") : t("form.requestEditorRole")}
              </button>
              <Link to="/role-requests" className="btn-secondary text-center font-medium">
                {t("form.viewRequests")}
              </Link>
            </div>
            {roleRequestMessage && (
              <p className="mt-3 text-xs text-slate-600">{roleRequestMessage}</p>
            )}
          </section>
        )}

        {userRole !== "user" && (
          <section className="ui-hover-card mb-6 rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">{t("form.workspaceTitle")}</h2>
                <p className="mt-1 text-xs text-slate-500">{t("form.workspaceDescription")}</p>
              </div>
              <Link to="/my-forms" className="btn-primary text-center">
                {t("form.goToMyForms")}
              </Link>
            </div>
          </section>
        )}

        {(videoCaseId || generatedCaseKey) && (
          <section className="ui-hover-card mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <h2 className="text-sm font-semibold text-slate-900">
              {language === "th" ? "เชื่อมกับ Video Case แล้ว" : "Video case linked"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {language === "th"
                ? videoCaseId
                  ? `แบบประเมินนี้จะถูกบันทึกในเคส ID ${videoCaseId}`
                  : "แบบประเมินนี้จะถูกบันทึกในเคสที่สร้างจากเลขที่สั่งงานและชื่อหัวข้อ"
                : videoCaseId
                  ? `This evaluation will be saved to case ID ${videoCaseId}.`
                  : "This evaluation will be saved to the case generated from the order number and subject name."}
            </p>
            {displayCaseLabel && (
              <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                {displayCaseLabel}
              </p>
            )}
            <div className="mt-3">
              <Link to="/video-cases" className="btn-secondary text-center">
                {language === "th" ? "เปิดหน้าจัดการเคส" : "Open video cases"}
              </Link>
            </div>
          </section>
        )}

        {showLegacyCaseSummary && (videoCaseId || generatedCaseKey) && (
          <section className="ui-hover-card mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <h2 className="text-sm font-semibold text-slate-900">à¸œà¸¹à¸à¸à¸±à¸š Video case à¹à¸¥à¹‰à¸§</h2>
            <p className="mt-1 text-xs text-slate-500">
              {videoCaseId
                ? `à¸£à¸²à¸¢à¸à¸²à¸£à¸™à¸µà¹‰à¸ˆà¸°à¸–à¸¹à¸à¸œà¸¹à¸à¸à¸±à¸šà¹€à¸„à¸ª ID ${videoCaseId}.`
                : "à¸£à¸²à¸¢à¸à¸²à¸£à¸™à¸µà¹‰à¸ˆà¸°à¸–à¸¹à¸à¸œà¸¹à¸à¸à¸±à¸šà¹€à¸„à¸ªà¸—à¸µà¹ˆà¸ªà¸£à¹‰à¸²à¸‡à¸ˆà¸²à¸à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹ƒà¸™à¸Ÿà¸­à¸£à¹Œà¸¡"}
            </p>
            {displayCaseLabel && (
              <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                {displayCaseLabel}
              </p>
            )}
            <div className="mt-3">
              <Link to="/video-cases" className="btn-secondary text-center">
                à¹€à¸›à¸´à¸”à¸«à¸™à¹‰à¸²à¸ˆà¸±à¸”à¸à¸²à¸£à¹€à¸„à¸ª
              </Link>
            </div>
          </section>
        )}

        <form noValidate onSubmit={handleSubmit} className="space-y-6">
          <section className="ui-hover-card space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="space-y-1 md:w-40">
                <label className="text-xs font-medium text-slate-700">
                  {t("form.orderNumber")} <span className="text-red-500">*</span>
                </label>
                <input
                  value={orderNumber}
                  readOnly={Boolean(videoCaseId)}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder={t("form.orderPlaceholder")}
                  required
                  aria-invalid={isOrderNumberInvalid}
                  className={`w-full rounded-xl bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 ${
                    isOrderNumberInvalid
                      ? "border border-red-400 focus:border-red-400 focus:ring-red-200 dark:border-red-500 dark:focus:border-red-500 dark:focus:ring-red-950/40"
                      : "border border-slate-200 focus:border-primary focus:ring-primary/60 dark:border-slate-700"
                  }`}
                />
                {isOrderNumberInvalid && (
                  <p className="text-xs font-medium text-red-600">{t("form.fillField")}</p>
                )}
              </div>

              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  {t("form.subjectName")} <span className="text-red-500">*</span>
                </label>
                <input
                  value={subjectName}
                  readOnly={Boolean(videoCaseId)}
                  onChange={(e) => setSubjectName(e.target.value)}
                  placeholder={t("form.subjectPlaceholder")}
                  required
                  aria-invalid={isSubjectNameInvalid}
                  className={`w-full rounded-xl bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 ${
                    isSubjectNameInvalid
                      ? "border border-red-400 focus:border-red-400 focus:ring-red-200 dark:border-red-500 dark:focus:border-red-500 dark:focus:ring-red-950/40"
                      : "border border-slate-200 focus:border-primary focus:ring-primary/60 dark:border-slate-700"
                  }`}
                />
                {isSubjectNameInvalid && (
                  <p className="text-xs font-medium text-red-600">{t("form.fillField")}</p>
                )}
              </div>
            </div>
          </section>

          <section className="ui-hover-card space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-900 md:text-base">
                {t("form.rubricTitle")}
              </h2>
              <p className="text-xs text-slate-600 md:text-sm">{t("form.rubricDescription")}</p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-slate-600 md:text-sm">
              {([1, 2, 3, 4, 5] as LikertValue[]).map((v) => (
                <div
                  key={v}
                  className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                    {v}
                  </span>
                  <span>{likertLabels[v]}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-5">
            {sections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                answers={answers[section.id] || {}}
                showValidation={showValidation}
                onToggle={(questionId, value) =>
                  handleToggleAnswer(section.id, questionId, value)
                }
              />
            ))}
          </section>

          <section className="ui-hover-card space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <label className="text-sm font-semibold text-slate-800">
              {t("form.overallSuggestion")} <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-slate-500">{t("form.overallSuggestionDescription")}</p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              required
              aria-invalid={isCommentInvalid}
              className={`mt-1 w-full resize-none rounded-xl bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 ${
                isCommentInvalid
                  ? "border border-red-400 focus:border-red-400 focus:ring-red-200 dark:border-red-500 dark:focus:border-red-500 dark:focus:ring-red-950/40"
                  : "border border-slate-200 focus:border-primary focus:ring-primary/60 dark:border-slate-700"
              }`}
              placeholder={t("form.overallSuggestionPlaceholder")}
            />
            {isCommentInvalid && (
              <p className="text-xs font-medium text-red-600">{t("form.fillField")}</p>
            )}
          </section>

          <section className="ui-hover-card space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 md:text-base">
                {t("form.submissionModeTitle")}
              </h2>
              <p className="mt-1 text-xs text-slate-500">{t("form.submissionModeDescription")}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label
                className={`cursor-pointer rounded-xl border p-4 motion-safe:transition ${
                  submissionMode === "data_only"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-slate-200 bg-white hover:border-primary/40"
                }`}
              >
                <input
                  type="radio"
                  name="submission_mode"
                  value="data_only"
                  checked={submissionMode === "data_only"}
                  onChange={() => handleSubmissionModeChange("data_only")}
                  className="sr-only"
                />
                <span className="text-sm font-semibold text-slate-900">
                  {t("form.submitDataOnly")}
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  {t("form.submitDataOnlyDesc")}
                </span>
              </label>
              <label
                className={`cursor-pointer rounded-xl border p-4 motion-safe:transition ${
                  submissionMode === "with_video"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-slate-200 bg-white hover:border-primary/40"
                }`}
              >
                <input
                  type="radio"
                  name="submission_mode"
                  value="with_video"
                  checked={submissionMode === "with_video"}
                  onChange={() => handleSubmissionModeChange("with_video")}
                  className="sr-only"
                />
                <span className="text-sm font-semibold text-slate-900">
                  {t("form.submitWithVideo")}
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  {t("form.submitWithVideoDesc")}
                </span>
              </label>
            </div>
          </section>

          <section className="ui-hover-card space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 md:text-base">
                {videoCaseUi.title}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {videoCaseUi.description}
              </p>
            </div>
            <div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium text-slate-700">{videoCaseUi.keyLabel}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  ระบบจะสร้างจากเลขที่สั่งงาน + ชื่อหัวข้อ + รหัสสั้นภายในอัตโนมัติ
                </p>
                <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700">
                  {displayCaseLabel || videoCaseUi.keyPlaceholder}
                </p>
                <p className="mt-2 text-[11px] text-slate-400">รหัสภายในถูกซ่อนจากผู้ใช้</p>
              </div>
            </div>
          </section>

          {submissionMode === "with_video" && (
            <section
              className={`ui-hover-card space-y-3 rounded-2xl bg-white p-4 shadow-sm md:p-6 ${
                isVideoInvalid ? "border border-red-300 ring-2 ring-red-100" : "border border-slate-200"
              }`}
            >
              <div>
                <label className="text-sm font-semibold text-slate-800">
                  {t("form.videoUpload")}
                </label>
                <p className="mt-1 text-xs text-slate-500">{t("form.videoUploadDescription")}</p>
              </div>
              <input
                ref={videoInputRef}
                type="file"
                name="video"
                accept=".mp4,.m4v,video/mp4,video/x-m4v"
                required
                onChange={handleVideoChange}
                disabled={isSaving}
                className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-primary/90 disabled:opacity-60"
              />
              {selectedVideoFile && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <p className="font-medium text-slate-900">{selectedVideoFile.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {selectedVideoFile.type || "video/*"} | {formatBytes(selectedVideoFile.size)}
                  </p>
                </div>
              )}
              {isVideoInvalid && (
                <p className="text-xs font-medium text-red-600">{validateVideoFile(selectedVideoFile)}</p>
              )}
            </section>
          )}

          <div className="pb-10">
            {submitErrorMessage &&
              !isOrderNumberInvalid &&
              !isSubjectNameInvalid &&
              !isCommentInvalid &&
              !isVideoInvalid && (
                <div className="mb-4 w-full rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-center text-sm text-red-600">
                  {submitErrorMessage}
                </div>
              )}
            {submitSuccessMessage && (
              <div className="mb-4 w-full rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700">
                {submitSuccessMessage}
              </div>
            )}
            {isSaving && submissionProgress && (
              <div className="mb-4 rounded-2xl border border-primary/20 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-slate-800">{submissionProgress.label}</span>
                  <span className="tabular-nums font-semibold text-primary">
                    {submissionProgress.percent}%
                  </span>
                </div>
                <div
                  className="h-3 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={submissionProgress.percent}
                  aria-label={submissionProgress.label}
                >
                  <div
                    className="h-full rounded-full bg-primary motion-safe:transition-all motion-safe:duration-300"
                    style={{ width: `${submissionProgress.percent}%` }}
                  />
                </div>
              </div>
            )}
            <div className="flex justify-center">
              <button
                type="submit"
                disabled={isSaving}
                className="btn-primary rounded-full px-6 py-2 text-base shadow-md"
              >
                {isSaving ? t("form.generating") : t("form.submit")}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

export default FormSubmit;
