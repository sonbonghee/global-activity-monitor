# Coolify 배포

Git 저장소 `https://github.com/sonbonghee/global-activity-monitor`의 **Dockerfile** 빌드 방식으로 단일 애플리케이션을 만듭니다. `sonbonghee/onist_deeptrace`는 별도의 Python 프로젝트이므로 이 모니터의 배포 소스로 사용하지 않습니다. 내부 포트(Ports Exposes)는 `4000`입니다. Dockerfile이 `0.0.0.0`에서 서버를 실행하고 `/healthz`를 상태 점검합니다.

## 필수 설정

1. 환경 변수 `AUTH_PASSWORD`에 충분히 긴 임의 비밀번호를 설정합니다. `AUTH_USER`는 기본 `monitor`입니다. 공개 바인딩에 비밀번호가 없으면 서버가 시작되지 않습니다.
2. Coolify **Persistent Storage**에 볼륨을 추가하고 컨테이너 Destination Path를 `/app/data`로 지정합니다. `DB_PATH=/app/data/monitor.db`가 기본값입니다. SQLite 데이터베이스와 WAL 파일이 이 경로에 저장됩니다. 컨테이너는 `node` 사용자(UID 1000)로 실행되므로 바인드 마운트를 선택했다면 해당 디렉터리에 UID 1000의 쓰기 권한을 부여하세요.
3. 공개 도메인을 연결하고 HTTPS를 활성화합니다. 앱의 Basic 인증은 로그인과 API 요청에 적용됩니다.
4. 선택적으로 `YOUTUBE_API_KEY`, `YOUTUBE_DAILY_SEARCH_LIMIT`, `KOREAN_WATCH_QUERIES`, `X_BEARER_TOKEN`을 설정합니다. 기존 `YOUTUBE_DAILY_BUDGET` 설정은 더 이상 사용하지 않으므로 `YOUTUBE_DAILY_SEARCH_LIMIT`로 교체하세요. Google 트렌드는 1시간마다 자동 수집하고 X는 수동 선택 시에만 검색합니다. 자동 감시어는 기본 `한국,서울,부산,재난,경제`이며 쉼표로 구분해 바꿀 수 있습니다. `off`로 끌 수 있습니다.

Coolify의 애플리케이션 상태 점검을 별도로 설정한다면 경로 `/healthz`, 포트 `4000`을 사용합니다. Dockerfile의 HEALTHCHECK가 이미 포함되어 있습니다.

## 운영

배포 후 `/healthz`가 `{"status":"ok"}`를 반환하는지 확인하고 로그인 후 `/`에서 수집을 실행하세요. SQLite는 단일 컨테이너 운영을 전제로 합니다. 복제본을 여러 개 실행하거나 서로 다른 서버에서 같은 볼륨을 공유하지 마세요. 컨테이너 재시작과 재배포 후에도 데이터가 남는지 확인하세요.

운영 중 백업은 Coolify 터미널에서 `npm run backup -- /app/data/backups/monitor-YYYYMMDD.db`로 만듭니다. 이 명령은 SQLite 온라인 백업을 수행하고 결과 파일의 무결성을 검사하며 기존 파일을 덮어쓰지 않습니다. 백업 파일은 `/app/data` 영구 볼륨 안에 생성되므로 별도 저장소로 주기적으로 복사하세요. 복원 시에는 앱을 중지하고 기존 데이터베이스와 `-wal`, `-shm` 파일을 별도 보관한 뒤 검증된 백업 파일을 `/app/data/monitor.db`로 복사하고 앱을 다시 시작합니다.

기존 세계 모니터는 `/global`에서 뉴스 RSS를 5분마다, 세계 사건 분석을 10분마다 갱신합니다. 뉴스 RSS 수집 직후 잠정 이슈를 먼저 표시하고, GDELT 분석이 끝나면 다시 갱신합니다. GDELT가 연속 3회 실패하면 그 주기의 나머지 호출을 건너뛰고 다음 주기에 재시도합니다. `/`는 시간별 이슈 후보, 사건 묶음, 수집 결과와 운영 상태를 보여줍니다.

## 다른 저장소의 배포 오류 구분

Coolify 로그에 `/app/backend/app.py`, `uvicorn`, `BOOTSTRAP_ADMIN_EMAIL`이 나타나면 이 Node.js 모니터가 아니라 `onist_deeptrace`가 배포된 것입니다. 해당 서비스의 Python 환경 변수를 이 모니터에 추가해도 문제가 해결되지 않습니다. Coolify의 Git 저장소를 `sonbonghee/global-activity-monitor`로 지정하고 Dockerfile 빌드, 내부 포트 4000, `/app/data` 영구 저장소 및 `AUTH_PASSWORD`를 설정해 새로 배포하세요.
