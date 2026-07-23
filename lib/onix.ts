// Minimal ONIX 3.0 (reference tags) message generator (spec v1 §5.1, lib/onix.ts).

export type OnixContributor = { name: string; role?: string };

export type OnixInput = {
  isbn13?: string | null;
  title: string;
  language?: string; // ISO 639-2/B, e.g. "uzb"
  format?: string; // ProductFormat enum
  contributors?: OnixContributor[];
  publisher?: string | null;
  listPriceUZS?: number | null;
  annotation?: string | null;
};

const FORM_CODE: Record<string, string> = {
  HARDCOVER: "BB",
  PAPERBACK: "BC",
  EBOOK: "EA",
  AUDIO: "AJ",
};

const ROLE_CODE: Record<string, string> = {
  AUTHOR: "A01",
  CO_AUTHOR: "A01",
  TRANSLATOR: "B06",
  EDITOR: "B01",
  ILLUSTRATOR: "A12",
  DESIGNER: "A11",
  NARRATOR: "E07",
  OTHER: "Z99",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function generateOnix(input: OnixInput): string {
  const contributors = (input.contributors ?? [])
    .map(
      (c, i) => `
      <Contributor>
        <SequenceNumber>${i + 1}</SequenceNumber>
        <ContributorRole>${ROLE_CODE[c.role ?? "AUTHOR"] ?? "A01"}</ContributorRole>
        <PersonName>${esc(c.name)}</PersonName>
      </Contributor>`,
    )
    .join("");

  const identifier = input.isbn13
    ? `
      <ProductIdentifier>
        <ProductIDType>15</ProductIDType>
        <IDValue>${esc(input.isbn13.replace(/[^0-9]/g, ""))}</IDValue>
      </ProductIdentifier>`
    : "";

  const annotation = input.annotation
    ? `
    <CollateralDetail>
      <TextContent>
        <TextType>03</TextType>
        <ContentAudience>00</ContentAudience>
        <Text>${esc(input.annotation)}</Text>
      </TextContent>
    </CollateralDetail>`
    : "";

  const publisher = input.publisher
    ? `
      <Publisher>
        <PublishingRole>01</PublishingRole>
        <PublisherName>${esc(input.publisher)}</PublisherName>
      </Publisher>`
    : "";

  const price =
    input.listPriceUZS != null
      ? `
        <Price>
          <PriceType>02</PriceType>
          <PriceAmount>${input.listPriceUZS.toFixed(2)}</PriceAmount>
          <CurrencyCode>UZS</CurrencyCode>
        </Price>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<ONIXMessage release="3.0" xmlns="http://ns.editeur.org/onix/3.0/reference">
  <Product>
    <RecordReference>${esc(input.isbn13 ? input.isbn13.replace(/[^0-9]/g, "") : input.title)}</RecordReference>
    <NotificationType>03</NotificationType>${identifier}
    <DescriptiveDetail>
      <ProductComposition>00</ProductComposition>
      <ProductForm>${FORM_CODE[input.format ?? "PAPERBACK"] ?? "BC"}</ProductForm>
      <TitleDetail>
        <TitleType>01</TitleType>
        <TitleElement>
          <TitleElementLevel>01</TitleElementLevel>
          <TitleText>${esc(input.title)}</TitleText>
        </TitleElement>
      </TitleDetail>${contributors}
      <Language>
        <LanguageRole>01</LanguageRole>
        <LanguageCode>${esc(input.language ?? "uzb")}</LanguageCode>
      </Language>
    </DescriptiveDetail>${annotation}
    <PublishingDetail>${publisher}
    </PublishingDetail>
    <ProductSupply>
      <SupplyDetail>${price}
      </SupplyDetail>
    </ProductSupply>
  </Product>
</ONIXMessage>`;
}
