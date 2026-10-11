# Session knowledge

## ADDED Requirements

### Requirement: Sessions read knowledge through unfold-mcp for the signed-in person

unfold-mcp SHALL offer `unfold_search_knowledge` and `unfold_read_knowledge`,
answered by Ploeg's operator knowledge routes for the person the editor
credential belongs to, with their Tenant role and Client (ADR-0035). Text from
agents and trackers SHALL sit under `untrusted`.

#### Scenario: A client user searches

- **WHEN** a client user of Client A searches knowledge
- **THEN** the result holds only Client A's and its repositories' concepts and its Work Items' notes, and no Tenant-wide concept

#### Scenario: Another Client's object by id

- **WHEN** a client user reads a concept of Client B by its id
- **THEN** the tool answers that nothing was found

### Requirement: Session writes need the person's confirmation

`unfold_write_note` and `unfold_suggest_promotion` SHALL be marked as writes,
and SHALL follow the same review line as a Run: a note is a Work Item Note,
anything wider is a Promotion request. A repeated call with the same request
key SHALL write once.

#### Scenario: A member suggests a repository convention

- **WHEN** a Tenant member calls `unfold_suggest_promotion` with repository scope
- **THEN** a pending Promotion exists and no Run under another root reads it

#### Scenario: A lost response

- **WHEN** a session repeats `unfold_write_note` with the same request key after a lost response
- **THEN** one note exists

### Requirement: The demo says it is one

In the deterministic demo the knowledge tools SHALL answer with a labelled
example and SHALL write nothing.

#### Scenario: Writing in the demo

- **WHEN** `unfold_write_note` is called in the demo
- **THEN** the answer says it is the demo and nothing is stored
