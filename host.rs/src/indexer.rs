use std::fs;
use std::io;
use std::path::Path;

use chrono::prelude::*;

extern crate tantivy;
use tantivy::collector;
use tantivy::collector::CountCollector;
use tantivy::collector::TopCollector;
use tantivy::query::QueryParser;
use tantivy::query::TermQuery;
use tantivy::schema::*;
use tantivy::Index;

const WRITER_HEAP_SIZE: usize = 50_000_000;

#[derive(Debug)]
pub enum CatalogError {
    Io(io::Error),
    Tantivy(tantivy::Error),
    ParserError(tantivy::query::QueryParserError),
}

impl From<io::Error> for CatalogError {
    fn from(err: io::Error) -> CatalogError {
        CatalogError::Io(err)
    }
}

impl From<tantivy::Error> for CatalogError {
    fn from(err: tantivy::Error) -> CatalogError {
        CatalogError::Tantivy(err)
    }
}

impl From<tantivy::query::QueryParserError> for CatalogError {
    fn from(err: tantivy::query::QueryParserError) -> CatalogError {
        CatalogError::ParserError(err)
    }
}

#[derive(Debug)]
struct IndexFields {
    url: Field,
    title: Field,
    body: Field,
    visited: Field,
    last_modified: Field,
}

#[derive(Serialize, Debug)]
pub struct DocumentHit {
    url: String,
    title: String,
    visited: DateTime<Utc>,
    last_modified: DateTime<Utc>,
}

#[derive(Debug)]
pub struct Catalog {
    index: Index,
    fields: IndexFields,
}

impl Catalog {
    pub fn new(path: &Path) -> Result<Catalog, CatalogError> {
        let index: Index;

        if !path.exists() {
            fs::create_dir_all(path)?;
            let schema = build_schema();
            index = Index::create_in_dir(path, schema)?;
        } else {
            index = Index::open_in_dir(path)?;
        }

        let schema = index.schema();
        let fields = IndexFields {
            url: schema.get_field("url").unwrap(),
            title: schema.get_field("title").unwrap(),
            body: schema.get_field("body").unwrap(),
            visited: schema.get_field("visited").unwrap(),
            last_modified: schema.get_field("last_modified").unwrap(),
        };

        let result = Catalog {
            index: index,
            fields: fields,
        };
        Ok(result)
    }

    pub fn get_last_modified(&self, url: &str) -> (DateTime<Utc>, DateTime<Utc>) {
        let doc_url = Term::from_field_text(self.fields.url, &url);

        let retrieved_doc = self.extract_doc_given_url(&doc_url);

        let resp = retrieved_doc.unwrap_or_default().map_or_else(
            || (Utc.timestamp(0, 0), Utc.timestamp(0, 0)),
            |doc| {
                (
                    Utc.timestamp(
                        doc.get_first(self.fields.visited)
                            .expect("visited shouldn't be empty")
                            .i64_value(),
                        0,
                    ),
                    Utc.timestamp(
                        doc.get_first(self.fields.last_modified)
                            .expect("last_modified shouldn't be empty")
                            .i64_value(),
                        0,
                    ),
                )
            },
        );

        resp
    }

    pub fn add(
        &self,
        url: &str,
        title: &str,
        contents: &str,
        modified: &DateTime<Utc>,
    ) -> Result<(), CatalogError> {
        let mut index_writer = self.index.writer(WRITER_HEAP_SIZE)?;

        let doc_url = Term::from_field_text(self.fields.url, url);
        index_writer.delete_term(doc_url.clone());

        index_writer.add_document(doc!(
            self.fields.url => url,
            self.fields.title => title,
            self.fields.body => contents,
            self.fields.visited => Utc::now().timestamp(),
            self.fields.last_modified => modified.timestamp()
        ));

        index_writer.commit()?;
        self.index.load_searchers()?;

        Ok(())
    }

    pub fn remove(&self, url: &str) -> Result<(), CatalogError> {
        let mut index_writer = self.index.writer(WRITER_HEAP_SIZE)?;

        let doc_url = Term::from_field_text(self.fields.url, url);
        index_writer.delete_term(doc_url.clone());

        index_writer.commit()?;
        self.index.load_searchers()?;

        Ok(())
    }

    pub fn search(
        &self,
        query: &str,
        page: usize,
        hist_per_page: usize,
        lang: &str,
    ) -> Result<(Vec<DocumentHit>, usize), CatalogError> {
        let searcher = self.index.searcher();
        let mut query_parser =
            QueryParser::for_index(&self.index, vec![self.fields.title, self.fields.body]);
        query_parser.set_conjunction_by_default();
        let query = query_parser.parse_query(&query)?;
        let mut count_collector = CountCollector::default();
        let mut top_collector = TopCollector::with_limit(hist_per_page);
        {
            let mut chained_collector = collector::chain()
                .push(&mut top_collector)
                .push(&mut count_collector);
            searcher.search(&*query, &mut chained_collector)?;
        }
        let doc_addresses = top_collector.docs();

        let mut docs: Vec<DocumentHit> = Vec::with_capacity(hist_per_page);

        for doc_address in doc_addresses {
            let doc = searcher.doc(&doc_address)?;
            docs.push(DocumentHit {
                url: doc
                    .get_first(self.fields.url)
                    .unwrap()
                    .text()
                    .unwrap()
                    .to_string(),
                title: doc
                    .get_first(self.fields.title)
                    .unwrap()
                    .text()
                    .unwrap()
                    .to_string(),
                visited: Utc.timestamp(doc.get_first(self.fields.visited).unwrap().i64_value(), 0),
                last_modified: Utc.timestamp(
                    doc.get_first(self.fields.last_modified)
                        .unwrap()
                        .i64_value(),
                    0,
                ),
            });
        }

        Ok((docs, count_collector.count()))
    }

    fn extract_doc_given_url(&self, url_term: &Term) -> tantivy::Result<Option<Document>> {
        let searcher = self.index.searcher();
        let term_query = TermQuery::new(url_term.clone(), IndexRecordOption::Basic);
        let mut top_collector = TopCollector::with_limit(1);
        searcher.search(&term_query, &mut top_collector)?;

        if let Some(doc_address) = top_collector.docs().first() {
            let doc = searcher.doc(doc_address)?;
            Ok(Some(doc))
        } else {
            Ok(None)
        }
    }
}

fn build_schema() -> Schema {
    let mut builder = SchemaBuilder::default();
    builder.add_text_field("url", STRING | STORED);
    builder.add_text_field("title", TEXT | STORED);
    builder.add_text_field("body", TEXT | STORED);
    builder.add_i64_field("visited", INT_STORED);
    builder.add_i64_field("last_modified", INT_STORED);
    builder.build()
}
