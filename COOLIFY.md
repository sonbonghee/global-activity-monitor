# Coolify 배포

Git 저장소의 **Dockerfile** 빌드 방식으로 단일 애플리케이션을 만듭니다. 내부 포트(Ports Exposes)는 `4000`입니다. Dockerfile이 `0.0.0.0`에서 서버를 실행하고 `/healthz`를 상태 점검합니다.

## 필수 설정

1. 환경 변수 `AUTH_PASSWORD`에 충분히 긴 임의 비밀번호를 설정합니다. `AUTH_USER`는 기본 `monitor`입니다. 공개 바인딩에 비밀번호가 없으면 서버가 시작되지 않습니다.
2. Coolify **Persistent Storage**에 볼륨을 추가하고 컨테이너 Destination Path를 `/app/data`로 지정합니다. `DB_PATH=/app/data/monitor.db`가 기본값입니다. SQLite 데이터베이스와 WAL 파일이 이 경로에 저장됩니다. 컨테이너는 `node` 사용자(UID 1000)로 실행되므로 바인드 마운트를 선택했다면 해당 디렉터리에 UID 1000의 쓰기 권한을 부여하세요.
3. 공개 도메인을 연결하고 HTTPS를 활성화합니다. 앱의 Basic 인증은 로그인과 API 요청에 적용됩니다.
4. 선택적으로 `YOUTUBE_API_KEY`, `YOUTUBE_DAILY_SEARCH_LIMIT`, `KOREAN_WATCH_QUERIES`, `X_BEARER_TOKEN`을 설정합니다. 기존 `YOUTUBE_DAILY_BUDGET` 설정은 더 이상 사용하지 않으므로 `YOUTUBE_DAILY_SEARCH_LIMIT`로 교체하세요. Google 트렌드는 1시간마다 자동 수집하고 X는 수동 선택 시에만 검색합니다. 자동 감시어는 기본 `한국,서울,부산,재난,경제`이며 쉼표로 구분해 바꿀 수 있습니다. `off`로 끌 수 있습니다.

Coolify의 애플리케이션 상태 점검을 별도로 설정한다면 경로 `/healthz`, 포트 `4000`을 사용합니다. Dockerfile의 HEALTHCHECK가 이미 포함되어 있습니다.

## 운영

배포 후 `/healthz`가 `{"status":"ok"}`를 반환하는지 확인하고 로그인 후 `/`에서 수집을 실행하세요. SQLite는 단일 컨테이너 운영을 전제로 합니다. 복제본을 여러 개 실행하거나 서로 다른 서버에서 같은 볼륨을 공유하지 마세요. 정기 백업은 `/app/data` 볼륨 전체를 대상으로 하며, 실행 중 파일 복사 대신 SQLite 온라인 백업을 사용하세요. 컨테이너 재시작과 재배포 후에도 데이터가 남는지 확인하세요.

기존 세계 모니터는 `/global`에 남아 있으나, 이 배포의 자동 작업은 한국어 뉴스 감시어 수집만 실행합니다. `/`는 시간별 이슈 후보, 사건 묶음, 수집 결과와 운영 상태를 보여줍니다.
