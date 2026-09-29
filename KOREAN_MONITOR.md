# 한국 인터넷 이슈 모니터

`npm ci && npm start` 후 `http://127.0.0.1:4000/`에서 검색, 이슈 후보, 수집 결과와 운영 상태를 확인합니다. 이전 세계 모니터 화면은 `/global`에 남아 있으며 두 화면의 상단 드롭다운에서 전환할 수 있습니다. 세계 뉴스 RSS와 GDELT 분석도 서버가 시작되면 실행됩니다. 글로벌 화면은 첫 뉴스 수집 직후 잠정 결과를 표시합니다.

- 뉴스: Google 뉴스의 한국어 RSS 검색. 키워드와 기간을 지정해 수집합니다.
- YouTube: `YOUTUBE_API_KEY`를 설정하면 공식 Data API의 `search.list`를 사용합니다. 검색 호출 횟수를 `YOUTUBE_DAILY_SEARCH_LIMIT`(기본 100회)로 제한합니다. 실제 프로젝트 할당량은 Google Cloud에서 확인하세요.
- Google 트렌드: 한국 인기 검색어 공식 RSS를 1시간마다 수집합니다. 키워드 수동 검색에도 선택할 수 있습니다.
- X: `X_BEARER_TOKEN`이 있고 해당 계정에 최근 검색 권한이 있으면 선택형으로 검색합니다. 자동 예약 검색은 하지 않습니다.
- 자동 수집: 기본 감시어 `한국,서울,부산,재난,경제` 중 시작 시 1개, 이후 15분마다 순차적으로 뉴스 검색을 수집합니다. `KOREAN_WATCH_QUERIES=서울,부산,재난`으로 교체하거나 `off`로 끌 수 있습니다.
- 저장: 기존 `DB_PATH` SQLite 데이터베이스에 `korean_*` 테이블을 추가합니다. 소스 응답 원문과 정규화 결과, 작업, 로그, 유튜브·X 검색 호출량, 소스별 응답 시간과 오류를 저장합니다.
- 이슈 후보: 수집된 제목과 요약에서 한국어 단어를 추출하고 중복 URL을 합친 후, 현재 기간의 건수, 이전 기간 대비 변화율, 소스 수로 점수를 계산합니다. 이슈 점수 이력을 저장하며 확인·제외 검토가 가능합니다. 제목·요약에 공통 키워드가 둘 이상인 보도를 사건 후보로 묶습니다. 한국어 형태소 분석과 의미 기반 군집화는 아직 포함하지 않아 후보를 원문으로 검토해야 합니다.

API: `POST /api/kr/search` (`{query,window:'1h'|'24h'|'7d',sources:['news','youtube','trends','x']}`), `GET /api/kr/items`, `GET /api/kr/issues`, `GET /api/kr/activities`, `GET /api/kr/clusters`, `GET /api/kr/operations`, `GET /api/kr/issues/:keyword/history`, `POST /api/kr/issues/:keyword/review`. 원격 수집 실행은 `AUTH_PASSWORD` 설정이 필요합니다. 기본 바인딩은 로컬호스트이며, 외부 배포 시 `HOST=0.0.0.0`과 `AUTH_PASSWORD`가 필수입니다. Coolify 설정은 [COOLIFY.md](COOLIFY.md)를 참고하세요.

## 현재 분석 범위

키워드 추출은 가벼운 규칙 기반이며 형태소·의미 모델을 사용하지 않습니다. 같은 사건을 잘못 묶거나 놓칠 수 있으므로 검토 상태와 관련 원문을 함께 확인하세요. Google 트렌드는 공식 인기 검색어 RSS 신호이며, 특정 키워드의 과거 검색량 시계열을 제공하지 않습니다. 공공 재난·교통 API 연동은 별도 인증과 데이터 사용 조건 확인이 필요해 아직 포함하지 않았습니다.
