-- The document library in Postgres: one current version of each document and
-- line-level keyword search. The demo keeps the same model in memory
-- (src/lib/content); this is the shape it maps to on the coach's database.

create table documents (
  id          bigserial primary key,
  slug        text not null,                    -- 'objection-playbook'
  code        text not null,                    -- 'OBJ', the prefix of every line ID
  title       text not null,
  channel     text not null default 'any' check (channel in ('any', 'call', 'email')),
  version     int  not null,
  status      text not null default 'draft' check (status in ('draft', 'approved', 'superseded')),
  approved_on date,
  unique (slug, version)
);

-- One current version of each document: at most one approved row per slug.
create unique index one_current_version on documents (slug) where status = 'approved';

create table lines (
  document_id bigint not null references documents (id) on delete cascade,
  line_id     text not null,                    -- 'OBJ-1.2': stable, cited in every answer
  section     text not null,                    -- 'Price: It costs too much'
  tags        text[] not null default '{}',
  kind        text not null check (kind in ('why', 'script')),
  body        text not null,
  primary key (document_id, line_id)
);

-- What a line is searched by: its section title and tags weigh more than the
-- line itself. array_to_string is only STABLE, but for text[] its result never
-- changes, so the function can be IMMUTABLE and back an index.
create function line_search(section text, tags text[], body text) returns tsvector
language sql immutable parallel safe as $$
  select setweight(to_tsvector('english', section || ' ' || array_to_string(tags, ' ')), 'A') ||
         setweight(to_tsvector('english', body), 'B')
$$;
create index lines_search on lines using gin (line_search(section, tags, body));

-- Approve a new version. The old approved version is superseded in the same
-- transaction, so there is never a moment with two current versions (or none).
create or replace function approve_document(p_slug text, p_version int) returns void
language plpgsql as $$
begin
  update documents set status = 'superseded'
   where slug = p_slug and status = 'approved' and version <> p_version;
  update documents set status = 'approved', approved_on = current_date
   where slug = p_slug and version = p_version;
  if not found then
    raise exception 'No % version % to approve', p_slug, p_version;
  end if;
end $$;

-- Line-level keyword search over current documents only: any word may match.
-- The coach then applies its acceptance rules (two topic words, a clear
-- margin) to these rows.
-- Usage: select * from search_lines('they say the price is too high');
create or replace function search_lines(p_question text, p_limit int default 5)
returns table (line_id text, title text, version int, section text, body text, score real)
language sql stable as $$
  with q as (
    select to_tsquery('english', replace(plainto_tsquery('english', p_question)::text, ' & ', ' | ')) as query
  )
  select l.line_id, d.title, d.version, l.section, l.body,
         ts_rank(line_search(l.section, l.tags, l.body), q.query) as score
  from lines l
  join documents d on d.id = l.document_id and d.status = 'approved'
  cross join q
  where l.kind = 'script' and line_search(l.section, l.tags, l.body) @@ q.query
  order by score desc, l.line_id
  limit p_limit
$$;
