import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";

import profilePic from "../assets/profile.jpg";
import MainNavbar from "../components/MainNavbar";
import { useLanguage } from "../i18n/useLanguage";
import { supabase } from "../lib/supabaseClient";
import { accountingService } from "../services/accountingService";
import { useAuthRole } from "../hooks/useAuthRole";

type UserInfoRow = {
  user_id: string;
  email: string;
  auth_user_id: string;
  full_name: string | null;
  employee_number: string | null;
  gender: string | null;
  avatar_url: string | null;
};

const PROFILE_AVATAR_BUCKET = "profile-avatars";
const PROFILE_QUERY_TIMEOUT_MS = 8000;
const PROFILE_SELECT_COLUMNS = "user_id, email, auth_user_id, full_name, employee_number, gender, avatar_url";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`${label} timed out`));
      }, timeoutMs);
    }),
  ]);
}

async function resizeAvatarImage(file: File, readFailed: string, prepareFailed: string, resizeFailed: string) {
  const imageUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error(readFailed));
      nextImage.src = imageUrl;
    });

    const maxSize = 512;
    const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error(prepareFailed);
    }

    context.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (!result) {
          reject(new Error(resizeFailed));
          return;
        }
        resolve(result);
      }, "image/jpeg", 0.82);
    });

    return blob;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { loading: authLoading, user: authUser } = useAuthRole();
  const genderOptions = [
    { value: "male", label: t("profile.male") },
    { value: "female", label: t("profile.female") },
    { value: "other", label: t("profile.other") },
    { value: "prefer_not_to_say", label: t("profile.preferNotToSay") },
  ];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfoRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showAvatarEditor, setShowAvatarEditor] = useState(false);
  const [editUserId, setEditUserId] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const [editEmployeeNumber, setEditEmployeeNumber] = useState("");
  const [editGender, setEditGender] = useState("prefer_not_to_say");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [localAvatarPreview, setLocalAvatarPreview] = useState<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);

  const loadProfile = useCallback(async (user: User) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: userInfoErr } = await withTimeout(
        supabase
          .from("user_information")
          .select(PROFILE_SELECT_COLUMNS)
          .eq("auth_user_id", user.id)
          .maybeSingle(),
        PROFILE_QUERY_TIMEOUT_MS,
        "Loading profile data",
      );

      if (!mountedRef.current) return;

      if (userInfoErr) {
        setError(userInfoErr.message);
        return;
      }

      const currentInfo: UserInfoRow = data
        ? (data as UserInfoRow)
        : {
            user_id: user.email?.split("@")[0] || "User",
            email: user.email || "",
            auth_user_id: user.id,
            full_name: null,
            employee_number: null,
            gender: null,
            avatar_url: null,
          };

      setUserInfo(currentInfo);
      setEditUserId(currentInfo.user_id);
      setEditEmail(currentInfo.email);
      setEditFullName(currentInfo.full_name || "");
      setEditEmployeeNumber(currentInfo.employee_number || "");
      setEditGender(currentInfo.gender || "prefer_not_to_say");
      setEditAvatarUrl(currentInfo.avatar_url || "");
    } catch (error) {
      if (!mountedRef.current) return;
      console.error("Failed to load profile:", error);
      setError(error instanceof Error ? error.message : t("profile.saveFailed"));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    mountedRef.current = true;

    if (authLoading) {
      setLoading(true);
      return () => {
        mountedRef.current = false;
      };
    }

    if (!authUser) {
      navigate("/", { replace: true });
      return () => {
        mountedRef.current = false;
      };
    }

    void loadProfile(authUser);
    return () => {
      mountedRef.current = false;
    };
  }, [authLoading, authUser, loadProfile, navigate]);

  useEffect(() => {
    if (!selectedAvatarFile) {
      setLocalAvatarPreview(null);
      return;
    }

    const previewUrl = URL.createObjectURL(selectedAvatarFile);
    setLocalAvatarPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedAvatarFile]);

  const resetEditState = () => {
    setIsEditing(false);
    setShowAvatarEditor(false);
    setSelectedAvatarFile(null);
    setLocalAvatarPreview(null);
    setError(null);
    setSuccess(null);

    if (avatarInputRef.current) {
      avatarInputRef.current.value = "";
    }

    if (userInfo) {
      setEditUserId(userInfo.user_id);
      setEditEmail(userInfo.email);
      setEditFullName(userInfo.full_name || "");
      setEditEmployeeNumber(userInfo.employee_number || "");
      setEditGender(userInfo.gender || "prefer_not_to_say");
      setEditAvatarUrl(userInfo.avatar_url || "");
    }
  };

  const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError(t("profile.invalidImage"));
      return;
    }

    setError(null);
    setSelectedAvatarFile(file);
  };

  const uploadAvatarFile = async (authUserId: string, file: File) => {
    const resizedBlob = await resizeAvatarImage(
      file,
      t("profile.imageReadFailed"),
      t("profile.imagePrepareFailed"),
      t("profile.imageResizeFailed"),
    );
    const path = `${authUserId}/avatar.jpg`;

    const { error: uploadError } = await supabase.storage
      .from(PROFILE_AVATAR_BUCKET)
      .upload(path, resizedBlob, {
        upsert: true,
        contentType: "image/jpeg",
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSave = async () => {
    if (!userInfo || !authUser) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const {
        data: { user: currentAuthUser },
        error: currentUserError,
      } = await supabase.auth.getUser();

      if (currentUserError) throw currentUserError;
      if (!currentAuthUser) {
        navigate("/", { replace: true });
        return;
      }

      let nextAvatarUrl = editAvatarUrl.trim() || null;
      const authUserId = currentAuthUser.id;
      const nextUserId = editUserId.trim();
      const nextEmail = editEmail.trim().toLowerCase();

      if (selectedAvatarFile) {
        nextAvatarUrl = await uploadAvatarFile(authUserId, selectedAvatarFile);
      }

      const { error: saveProfileError } = await supabase.rpc("save_my_user_information", {
        p_user_id: nextUserId,
        p_email: nextEmail,
        p_full_name: editFullName.trim() || null,
        p_employee_number: editEmployeeNumber.trim() || null,
        p_gender: editGender || null,
        p_avatar_url: nextAvatarUrl,
      });

      if (saveProfileError) throw saveProfileError;

      if (nextEmail !== userInfo.email) {
        const { error: updateEmailError } = await supabase.auth.updateUser({
          email: nextEmail,
        });
        if (updateEmailError) throw updateEmailError;
      }

      void accountingService
        .logActivity({
          user_id: authUserId,
          action: "profile.updated",
          resource: "user_information",
          metadata: {
            changed_email: nextEmail !== userInfo.email,
            changed_user_id: nextUserId !== userInfo.user_id,
            changed_full_name: (editFullName.trim() || null) !== userInfo.full_name,
            changed_employee_number: (editEmployeeNumber.trim() || null) !== userInfo.employee_number,
            changed_gender: (editGender || null) !== userInfo.gender,
            changed_avatar_url: nextAvatarUrl !== userInfo.avatar_url,
          },
        })
        .catch((logError) => {
          console.error("Activity log failed:", logError);
        });

      setSuccess(t("profile.saveSuccess"));
      setSelectedAvatarFile(null);
      setLocalAvatarPreview(null);
      setShowAvatarEditor(false);
      setIsEditing(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
      await loadProfile(currentAuthUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("profile.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const avatarSrc = localAvatarPreview || (isEditing ? editAvatarUrl : userInfo?.avatar_url) || profilePic;
  const avatarEditorOpen = isEditing && showAvatarEditor;

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />

      <div className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-12">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-6">
                <div className="h-24 w-24 aspect-square overflow-hidden rounded-full border-2 border-[#04418b]/10 bg-white shadow-sm ring-4 ring-[#04418b]/5 dark:border-sky-400/20 dark:bg-slate-950 dark:ring-sky-400/10">
                  <img
                    src={avatarSrc}
                    alt="Profile"
                    className="block h-full w-full rounded-full object-cover object-center"
                  />
                </div>
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAvatarEditor((current) => !current);
                    }}
                    disabled={saving}
                    aria-label={avatarEditorOpen ? t("profile.closePhotoEdit") : t("profile.changePhoto")}
                    title={avatarEditorOpen ? t("profile.closePhotoEdit") : t("profile.changePhoto")}
                    className="absolute -bottom-1 -right-1 inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-slate-950 text-white shadow-md outline-none transition hover:bg-[#04418b] focus-visible:ring-4 focus-visible:ring-[#04418b]/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-900 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                  >
                    <CameraIcon className="h-4 w-4" />
                  </button>
                )}
              </div>

              {avatarEditorOpen && (
                <div className="mb-8 w-full max-w-md border-y border-slate-100 bg-slate-50/70 px-4 py-5 text-left dark:border-slate-800 dark:bg-slate-950/60 sm:rounded-2xl sm:border">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarFileChange}
                    className="hidden"
                  />

                  <div className="min-w-0">
                    <div className="text-xs font-bold uppercase text-slate-400 dark:text-slate-500">{t("profile.avatar")}</div>
                    <div className="mt-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {selectedAvatarFile ? selectedAvatarFile.name : t("profile.avatarHint")}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="btn-ghost-primary inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold"
                    >
                      <CameraIcon className="h-4 w-4" />
                      <span>{t("profile.chooseImage")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAvatarFile(null);
                        setEditAvatarUrl("");
                        if (avatarInputRef.current) {
                          avatarInputRef.current.value = "";
                        }
                      }}
                      aria-label={t("profile.removeImage")}
                      title={t("profile.removeImage")}
                      className="btn-secondary inline-flex h-full min-h-12 w-12 items-center justify-center rounded-xl p-0"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              <h1 className="text-xl font-bold text-slate-800">
                {loading ? t("profile.loadingProfile") : userInfo?.full_name || userInfo?.user_id || t("profile.defaultName")}
              </h1>
              <p className="mt-1 text-sm text-slate-400">{t("profile.subtitle")}</p>
            </div>

            <div className="mx-auto mt-12 w-full max-w-md">
              {error && (
                <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4 text-center text-sm text-red-600 dark:border-red-400/30 dark:bg-red-950/30 dark:text-red-200">
                  {error}
                </div>
              )}

              {success && (
                <div className="mb-6 rounded-xl border border-[#04418b]/10 bg-[#04418b]/5 p-4 text-center text-sm text-[#04418b] dark:border-sky-400/30 dark:bg-sky-950/30 dark:text-sky-200">
                  {success}
                </div>
              )}

              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="text-sm text-slate-500">{t("profile.loadingProfile")}</div>
                </div>
              ) : isEditing ? (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <InputGroup label={t("profile.userId")} value={editUserId} onChange={setEditUserId} placeholder={t("profile.enterUserId")} />
                    <InputGroup label={t("profile.employeeNumber")} value={editEmployeeNumber} onChange={setEditEmployeeNumber} placeholder={t("profile.enterEmployeeNumber")} />
                    <InputGroup label={t("profile.fullName")} value={editFullName} onChange={setEditFullName} placeholder={t("profile.enterFullName")} />
                    <SelectGroup label={t("profile.gender")} value={editGender} onChange={setEditGender} options={genderOptions} />
                    <InputGroup label={t("profile.email")} value={editEmail} onChange={setEditEmail} type="email" placeholder={t("profile.enterEmail")} />
                  </div>

                  <div className="flex flex-col gap-3 pt-4">
                    <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-3.5 text-sm font-bold">
                      {saving ? t("profile.saving") : t("profile.saveChanges")}
                    </button>
                    <button onClick={resetEditState} disabled={saving} className="btn-secondary w-full rounded-full px-6 py-3 text-sm font-medium">
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="divide-y divide-slate-100">
                    <DisplayItem label={t("profile.userId")} value={userInfo?.user_id || "-"} />
                    <DisplayItem label={t("profile.employeeNumber")} value={userInfo?.employee_number || "-"} />
                    <DisplayItem label={t("profile.fullName")} value={userInfo?.full_name || "-"} />
                    <DisplayItem label={t("profile.gender")} value={genderOptions.find((option) => option.value === userInfo?.gender)?.label || "-"} />
                    <DisplayItem label={t("profile.email")} value={userInfo?.email || "-"} />
                  </div>

                  <div className="flex flex-col items-center gap-4 pt-6">
                    <button
                      onClick={() => {
                        setIsEditing(true);
                        setShowAvatarEditor(false);
                        setSelectedAvatarFile(null);
                        setLocalAvatarPreview(null);
                      }}
                      className="btn-ghost-primary flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      <span>{t("profile.editProfile")}</span>
                    </button>

                    <button
                      onClick={async () => {
                        await supabase.auth.signOut();
                        navigate("/", { replace: true });
                      }}
                      disabled={saving}
                      className="btn-danger min-w-32 rounded-full px-6 py-3 text-sm font-medium"
                    >
                      {t("common.logout")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InputGroup({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="ml-1 text-xs font-bold uppercase tracking-tight text-slate-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border-2 border-transparent bg-[#F8FAFC] px-4 py-3.5 text-sm font-medium text-slate-700 outline-none placeholder:text-slate-300 focus:border-[#04418b]/10 focus:bg-white focus:ring-4 focus:ring-[#04418b]/5 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-sky-400/30 dark:focus:bg-slate-950 dark:focus:ring-sky-400/10"
      />
    </div>
  );
}

function SelectGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-2">
      <label className="ml-1 text-xs font-bold uppercase tracking-tight text-slate-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border-2 border-transparent bg-[#F8FAFC] px-4 py-3.5 text-sm font-medium text-slate-700 outline-none focus:border-[#04418b]/10 focus:bg-white focus:ring-4 focus:ring-[#04418b]/5 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-sky-400/30 dark:focus:bg-slate-950 dark:focus:ring-sky-400/10"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DisplayItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-5">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="text-sm font-bold text-slate-700">{value}</span>
    </div>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M14.5 4.5 13 3H9L7.5 4.5H5.75A2.75 2.75 0 0 0 3 7.25v9A2.75 2.75 0 0 0 5.75 19h12.5A2.75 2.75 0 0 0 21 16.25v-9a2.75 2.75 0 0 0-2.75-2.75H14.5Z" />
      <circle cx="12" cy="12" r="3.25" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6 18 20H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}
