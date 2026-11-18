CREATE TYPE "ConsentType" AS ENUM ('BIOMETRIC_FACE_DATA');
CREATE TABLE consent_terms_versions (
  id TEXT PRIMARY KEY,
  consent_type "ConsentType" NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  enacted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT consent_terms_nonempty CHECK (length(version) BETWEEN 1 AND 40 AND length(title) > 0 AND length(content_markdown) > 0)
);
CREATE UNIQUE INDEX uq_terms_type_version ON consent_terms_versions(consent_type, version);
CREATE UNIQUE INDEX consent_one_active_version ON consent_terms_versions(consent_type) WHERE is_active;
CREATE INDEX consent_terms_versions_consent_type_is_active_idx ON consent_terms_versions(consent_type, is_active);

DROP INDEX user_consent_histories_user_id_key;
ALTER TABLE user_consent_histories ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE user_consent_histories
  ADD COLUMN guest_device_id TEXT,
  ADD COLUMN terms_version_id TEXT REFERENCES consent_terms_versions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN consent_type "ConsentType" NOT NULL DEFAULT 'BIOMETRIC_FACE_DATA',
  ADD COLUMN user_agent TEXT,
  ADD COLUMN ip_source TEXT NOT NULL DEFAULT 'UNAVAILABLE',
  ADD CONSTRAINT consent_owner_required CHECK (user_id IS NOT NULL OR guest_device_id IS NOT NULL),
  ADD CONSTRAINT consent_ip_source CHECK (ip_source IN ('UNAVAILABLE','TRUSTED_HEADER'));
CREATE INDEX user_consent_histories_user_id_consent_type_idx ON user_consent_histories(user_id,consent_type);
CREATE INDEX user_consent_histories_guest_device_id_consent_type_idx ON user_consent_histories(guest_device_id,consent_type);
CREATE INDEX user_consent_histories_terms_version_id_idx ON user_consent_histories(terms_version_id);

CREATE FUNCTION protect_consent_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Only the explicit one-time ownership binding is mutable; original actor,
  -- version, decision, timestamp, IP and UA remain the original audit facts.
  IF OLD.user_id IS NULL AND NEW.user_id IS NOT NULL AND OLD.guest_device_id IS NOT NULL
     AND (to_jsonb(NEW) - 'user_id') = (to_jsonb(OLD) - 'user_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Consent audit facts are immutable' USING ERRCODE='23514';
END; $$;
CREATE TRIGGER consent_audit_immutable BEFORE UPDATE ON user_consent_histories
FOR EACH ROW EXECUTE FUNCTION protect_consent_audit();

CREATE FUNCTION protect_consent_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'is_active') IS DISTINCT FROM (to_jsonb(OLD) - 'is_active') THEN
    RAISE EXCEPTION 'Publish a new terms version instead of rewriting terms' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER consent_terms_immutable BEFORE UPDATE ON consent_terms_versions
FOR EACH ROW EXECUTE FUNCTION protect_consent_terms();

-- Draft only: no operational retention/deletion claims or automatic publication.
INSERT INTO consent_terms_versions(id,consent_type,version,title,content_markdown,is_active,enacted_at)
VALUES ('61a9319c-0b2f-4fd5-868a-770c37960801','BIOMETRIC_FACE_DATA','v1.0-draft',
'안면 사진 수집·이용 동의 문안 검토용 초안',
'이 문안은 비활성 개발 초안이며 사용자 동의를 받을 수 없습니다. 수집 항목: 얼굴 사진과 외관 참고 정보. 목적: 문진을 보조하는 일상 스킨케어 참고 리포트. 거부 시 사진 기능은 이용할 수 없으며 문진만 이용할 수 있습니다. 실제 보관 기간, 삭제·철회 처리, 외부 AI 제공자 및 처리 범위를 운영자가 검증하고 확정한 새 버전을 게시하기 전까지 사진 업로드를 허용하지 않습니다. 현재 24시간 자동 삭제나 탈퇴 즉시 파기를 보장하지 않습니다.',
FALSE, '2026-11-18T00:00:00Z');
