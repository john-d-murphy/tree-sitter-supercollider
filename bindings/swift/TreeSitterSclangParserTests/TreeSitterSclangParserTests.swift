import XCTest
import SwiftTreeSitter
import TreeSitterSclangParser

final class TreeSitterSclangParserTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_sclang_parser())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading SuperCollider Language Parser grammar")
    }
}
