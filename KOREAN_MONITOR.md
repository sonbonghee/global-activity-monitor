# 한국 인터넷 이슈 모니터

`npm ci && npm start` 후 `http://127.0.0.1:4000/`에서 검색, 이슈 후보, 수집 결과와 운영 상태를 확인합니다. 이전 세계 모니터 화면은 `/global`에 남아 있습니다.

- 뉴스: Google 뉴스의 한국어 RSS 검색. 키워드와 기간을 지정해 수집합니다.
- YouTube: `YOUTUBE_API_KEY`를 설정하면 공식 Data API의 `search.list`를 사용합니다. 호출마다 100 units를 일일 자체 예산(`YOUTUBE_DAILY_BUDGET`, 기본 1000)에 먼저 반영합니다. 실제 프로젝트 할당량은 Google Cloud에서 따로 확인하세요.
- 자동 수집: 기본 감시어 `한국,서울,부산,재난,경제` 중 시작 시 1개, 이후 15분마다 순차적으로 뉴스 검색을 수집합니다. `KOREAN_WATCH_QUERIES=서울,부산,재난`으로 교체하거나 `off`로 끌 수 있습니다.
- 저장: 기존 `DB_PATH` SQLite 데이터베이스에 `korean_*` 테이블을 추가합니다. 수집 원문, 작업, 로그, YouTube 예산 사용량을 저장합니다.
- 이슈 후보: 수집된 제목과 요약에서 한국어 단어를 추출하고 중복 URL을 합친 후, 현재 기간의 건수, 이전 기간 대비 변화율, 소스 수로 점수를 계산합니다. 한국어 형태소 분석과 의미 기반 군집화는 아직 포함하지 않아 후보를 원문으로 검토해야 합니다.

API: `POST /api/kr/search` (`{query,window:'1h'|'24h'|'7d',sources:['news','youtube']}`), `GET /api/kr/items`, `GET /api/kr/issues`, `GET /api/kr/activities`, `GET /api/kr/operations`. 원격 수집 실행은 `AUTH_PASSWORD` 설정이 필요합니다. 기본 바인딩은 로컬호스트이며, 외부 배포 시 `HOST=0.0.0.0`과 `AUTH_PASSWORD`가 필수입니다. Coolify 설정은 [COOLIFY.md](COOLIFY.md)를 참고하세요.
