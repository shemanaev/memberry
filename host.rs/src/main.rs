use std::env;
use std::io;
use std::io::Write;
use std::path::PathBuf;

extern crate chrono;
use chrono::prelude::*;

#[macro_use(println_stderr)]
extern crate webextension_protocol as protocol;

extern crate serde;
extern crate serde_json;
#[macro_use]
extern crate serde_derive;
use serde_json::Error;

#[macro_use]
extern crate tantivy;

mod indexer;
use indexer::*;

#[derive(Serialize, Debug)]
struct VersionResponse {
    version: String,
}

#[derive(Serialize, Debug)]
struct CheckResponse {
    visited: DateTime<Utc>,
    last_modified: DateTime<Utc>,
}

#[derive(Serialize, Debug)]
struct SearchResponse {
    total: u32,
    hits: Vec<DocumentHit>,
}

#[derive(Serialize, Debug)]
#[serde(tag = "type", content = "data")]
enum ResponseData {
    Success(),
    Version(VersionResponse),
    Check(CheckResponse),
    Search(SearchResponse),
}

#[derive(Serialize, Debug)]
struct Response {
    rid: u32,
    #[serde(flatten)]
    data: ResponseData,
}

#[derive(Deserialize, Debug)]
struct Version {
    client: String,
}

#[derive(Deserialize, Debug)]
struct Add {
    url: String,
    lang: String,
    title: String,
    contents: String,
    last_modified: DateTime<Utc>,
}

#[derive(Deserialize, Debug)]
struct Remove {
    url: String,
}

#[derive(Deserialize, Debug)]
struct Check {
    url: String,
}

#[derive(Deserialize, Debug)]
struct Search {
    query: String,
    page: u32,
    #[serde(default = "default_hits_per_page")]
    hits_per_page: u32,
    #[serde(default = "default_search_lang")]
    lang: String,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", content = "data")]
enum RequestData {
    Version(Version),
    Add(Add),
    Remove(Remove),
    Check(Check),
    Search(Search),
}

#[derive(Deserialize, Debug)]
struct Request {
    id: u32,
    #[serde(flatten)]
    data: RequestData,
}

fn default_hits_per_page() -> u32 {
    6
}

fn default_search_lang() -> String {
    "en".to_string()
}

fn main() {
    let storage_path = get_storage_path().unwrap();
    let catalog = Catalog::new(storage_path.as_path()).unwrap();

    loop {
        let message = protocol::read_stdin().unwrap();

        let req: Request = serde_json::from_str(&message).unwrap();
        println_stderr!("INCOMING: {:?}", req);

        let resp = process_request(req, &catalog).unwrap();
        println_stderr!("OUTGOING: {:?}", resp);

        let result = serde_json::to_string(&resp).unwrap();
        protocol::write_stdout(result);
    }
}

fn process_request(req: Request, catalog: &Catalog) -> Result<Response, Error> {
    let result = match req.data {
        RequestData::Version(version) => version_request(version),
        RequestData::Check(check) => check_request(check, &catalog),
        RequestData::Add(add) => add_request(add, &catalog),
        RequestData::Remove(remove) => remove_request(remove, &catalog),
        RequestData::Search(search) => search_request(search, &catalog),
    };

    let response = Response {
        rid: req.id,
        data: result,
    };

    Ok(response)
}

fn get_storage_path() -> io::Result<PathBuf> {
    let exe = env::current_exe()?;
    let dir = exe.parent().expect("Executable must be in some directory");
    let dir = dir.join("storage");
    Ok(dir)
}

fn version_request(version: Version) -> ResponseData {
    let result = ResponseData::Version(VersionResponse {
        version: "1.0".to_owned(),
    });
    let _ = version.client;
    result
}

fn check_request(check: Check, catalog: &Catalog) -> ResponseData {
    let (visited, last_modified) = catalog.get_last_modified(&check.url);

    ResponseData::Check(CheckResponse {
        visited: visited,
        last_modified: last_modified,
    })
}

fn add_request(doc: Add, catalog: &Catalog) -> ResponseData {
    let _ = catalog.add(&doc.url, &doc.title, &doc.contents, &doc.last_modified);

    let result = ResponseData::Success();
    result
}

fn remove_request(remove: Remove, catalog: &Catalog) -> ResponseData {
    let _ = catalog.remove(&remove.url);

    let result = ResponseData::Success();
    result
}

fn search_request(search: Search, catalog: &Catalog) -> ResponseData {
    let (docs, count) = catalog
        .search(
            &search.query,
            search.page as usize,
            search.hits_per_page as usize,
            &search.lang,
        )
        .unwrap();

    let result = ResponseData::Search(SearchResponse {
        total: count as u32,
        hits: docs,
    });
    println_stderr!("{}, {}", search.query, count as u32);

    result
}
