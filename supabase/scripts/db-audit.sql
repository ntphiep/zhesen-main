-- Kiểm kê dung lượng và rác của database zhesen.
-- Chạy trong Supabase SQL Editor. Chỉ đọc, không sửa gì.
-- Xem AGENTS.md mục "Bẫy dữ liệu và Postgres" trước khi hành động theo kết quả.

-- 1. Tổng dung lượng so với trần 500 MB của gói Free.
select pg_size_pretty(pg_database_size(current_database())) as db_size,
       round(pg_database_size(current_database()) / 1048576.0, 1) as db_mb,
       round(100 * pg_database_size(current_database()) / (500 * 1048576.0), 1) as pct_cua_tran_500mb;

-- 2. Từng bảng chiếm bao nhiêu, và phần chênh thuộc về PGroonga.
--    PGroonga giữ dữ liệu index ở tệp riêng mà pg_relation_size không thấy,
--    nên tổng các bảng dưới đây sẽ NHỎ HƠN pg_database_size ở trên.
select n.nspname as schema, c.relname as ten_bang,
       pg_size_pretty(pg_total_relation_size(c.oid)) as tong,
       pg_size_pretty(pg_relation_size(c.oid)) as rieng_bang,
       pg_size_pretty(pg_indexes_size(c.oid)) as index,
       c.reltuples::bigint as so_dong_uoc_tinh
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname in ('public', 'lex', 'auth', 'storage')
order by pg_total_relation_size(c.oid) desc;

-- 3. Mọi schema và số bảng trong đó, để phát hiện schema rác.
select n.nspname as schema, count(c.oid) as so_bang,
       pg_size_pretty(coalesce(sum(pg_total_relation_size(c.oid)), 0)) as tong
from pg_namespace n
left join pg_class c on c.relnamespace = n.oid and c.relkind = 'r'
where n.nspname not like 'pg_%' and n.nspname <> 'information_schema'
group by n.nspname order by 3 desc;

-- 4. Index chưa bao giờ được dùng: ứng viên xoá để lấy lại dung lượng.
--    idx_scan = 0 nghĩa là chưa lần nào Postgres chọn index này kể từ lần
--    thống kê được reset gần nhất.
select s.schemaname, s.relname as bang, s.indexrelname as index, s.idx_scan,
       pg_size_pretty(pg_relation_size(s.indexrelid)) as kich_thuoc
from pg_stat_user_indexes s
join pg_index i on i.indexrelid = s.indexrelid
where not i.indisunique and s.schemaname in ('public', 'lex')
order by s.idx_scan, pg_relation_size(s.indexrelid) desc;

-- 5. Chỗ chết trong bảng: dead tuple nhiều là dấu hiệu cần `vacuum` thường.
--    KHÔNG chạy `vacuum full` trên lex.entries, xem AGENTS.md.
select schemaname, relname, n_live_tup, n_dead_tup,
       round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 1) as pct_chet,
       last_vacuum, last_autovacuum
from pg_stat_user_tables
where schemaname in ('public', 'lex') and n_dead_tup > 0
order by n_dead_tup desc;

-- 6. Đối tượng PGroonga thừa: mỗi khoá Sources<n> phải khớp relfilenode của
--    một index PGroonga đang sống. Khoá không khớp là rác từ lần VACUUM FULL cũ.
select c.relname, c.relfilenode
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relam = (select oid from pg_am where amname = 'pgroonga');

-- 7. Dòng mồ côi: con trỏ tới mục từ không còn tồn tại.
select 'senses' as bang, count(*) from lex.senses s left join lex.entries e on e.id = s.entry_id where e.id is null
union all select 'examples', count(*) from lex.examples x left join lex.entries e on e.id = x.entry_id where e.id is null
union all select 'inflections', count(*) from lex.inflections i left join lex.entries e on e.id = i.entry_id where e.id is null
union all select 'pronunciations', count(*) from lex.pronunciations p left join lex.entries e on e.id = p.entry_id where e.id is null
union all select 'lex_relations', count(*) from lex.lex_relations r left join lex.entries e on e.id = r.entry_id where e.id is null;

-- 8. Chi phí của index đang cân nhắc thêm cho lex.inflections(form_text),
--    ước lượng trước khi tạo: tổng độ dài khoá cộng overhead mỗi dòng.
select pg_size_pretty((sum(pg_column_size(form_text)) + count(*) * 16)::bigint) as uoc_tinh_index
from lex.inflections;
