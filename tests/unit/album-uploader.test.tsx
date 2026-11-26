import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), upload: vi.fn(), validate: vi.fn() }));
vi.mock("@/lib/image/clientPreprocess", () => ({
  preprocessAlbumImage: mocks.prepare,
  validateAlbumFile: mocks.validate,
}));
vi.mock("@/lib/api/diagnosticUploadClient", async (original) => ({
  ...(await original<typeof import("@/lib/api/diagnosticUploadClient")>()),
  uploadDiagnosticImage: mocks.upload,
}));
vi.mock("@/components/diagnostic/ManualPhotoAdjuster", () => ({
  ManualPhotoAdjuster: ({
    onConfirm,
  }: {
    onConfirm: (image: unknown, summary: unknown) => Promise<void>;
  }) => (
    <button
      onClick={async () =>
        onConfirm(await mocks.prepare(), {
          appliedBrightness: 10,
          appliedContrast: 0,
          appliedScale: 1,
        })
      }
    >
      보정 확정
    </button>
  ),
}));
import { AlbumImageUploader } from "@/components/diagnostic/AlbumImageUploader";
import { UploadActivityProvider } from "@/components/diagnostic/UploadActivity";
import { ImageUploadError } from "@/lib/api/diagnosticUploadClient";
const processed = {
  blob: new Blob(),
  mimeType: "image/jpeg",
  fileSizeBytes: 12000,
  previewUrl: "blob:test",
  width: 100,
  height: 100,
};
beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mocks.prepare.mockResolvedValue(processed);
  vi.stubGlobal("URL", Object.assign(URL, { revokeObjectURL: vi.fn() }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(onComplete = vi.fn(), requestConsent?: () => Promise<boolean>) {
  return render(
    <UploadActivityProvider>
      <AlbumImageUploader onUploadComplete={onComplete} requestConsent={requestConsent} />
    </UploadActivityProvider>,
  );
}
function select() {
  fireEvent.change(screen.getByLabelText("앨범 사진 파일"), {
    target: { files: [new File(["data"], "face.jpg", { type: "image/jpeg" })] },
  });
}
describe("album uploader states", () => {
  it("blocks invalid originals before preprocessing or APIs", async () => {
    mocks.validate.mockImplementation(() => {
      throw new Error("JPG, PNG, WebP 형식의 이미지 파일만 업로드할 수 있습니다.");
    });
    mount();
    select();
    expect(screen.getByRole("alert").textContent).toContain("JPG, PNG, WebP");
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("disables selection, shows transfer progress, reports confirmed payload and revokes preview on unmount", async () => {
    let finish:
      ((value: { uploadSessionId: string; s3Key: string; previewUrl: string }) => void) | undefined;
    mocks.upload.mockImplementation(
      (_image: unknown, _signal: unknown, report: (phase: string, value: number) => void) => {
        report("transfer", 40);
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    );
    const complete = vi.fn();
    const view = mount(complete);
    select();
    expect(mocks.upload).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "보정 확정" }));
    await waitFor(() => expect(screen.getByRole("progressbar").getAttribute("value")).toBe("40"));
    expect(screen.getByRole("button", { name: "사진 다시 선택" }).hasAttribute("disabled")).toBe(
      true,
    );
    const result = {
      uploadSessionId: "confirmed-id",
      s3Key: "raw-faces/confirmed.jpeg",
      previewUrl: "blob:test",
    };
    finish?.(result);
    await waitFor(() =>
      expect(complete).toHaveBeenLastCalledWith({
        ...result,
        adjustmentSummary: { appliedBrightness: 10, appliedContrast: 0, appliedScale: 1 },
      }),
    );
    expect(screen.getByRole("status").textContent).toContain("안전하게 등록");
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
  it("rechecks consent after editing and discards the corrected image when consent is denied", async () => {
    const consent = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    mount(vi.fn(), consent);
    select();
    fireEvent.click(await screen.findByRole("button", { name: "보정 확정" }));
    await waitFor(() => expect(consent).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByAltText("선택한 정면 사진 미리보기")).toBeNull());
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
  it("offers retry for URL/PUT failures and reuses only the processed in-memory image", async () => {
    mocks.upload
      .mockRejectedValueOnce(
        new ImageUploadError(
          "link",
          "진단 이미지 업로드 요청 한도를 초과했습니다. 1시간 후 다시 시도해주세요.",
        ),
      )
      .mockResolvedValueOnce({ uploadSessionId: "id", s3Key: "key", previewUrl: "blob:test" });
    mount();
    select();
    fireEvent.click(await screen.findByRole("button", { name: "보정 확정" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("1시간 후"));
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
  });
});
