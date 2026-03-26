-- Seed: Release of Release contract template for default mandator
INSERT INTO public.contract_templates (
    mandator_id,
    name,
    body,
    jurisdiction_canton,
    governing_law
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Release of Release Agreement (CH)',
$$# Release of Release Agreement

This Release of Release Agreement (the **"Agreement"**) is entered into as of {{contract_date}} between:

**LABEL**
{{label_name}}
{{label_address}}
UID: {{label_uid}}
(hereinafter **"Label"**)

and

**ARTIST**
{{artist_name}}
{{artist_address}}
Date of Birth: {{artist_dob}}
(hereinafter **"Artist"**)

collectively referred to as the **"Parties"**.

---

## 1. Purpose

**1.1** The purpose of this Agreement is to authorise the commercial release, distribution, and exploitation of the sound recording(s) described in Section 2 (the **"Release"**) by the Label on behalf of the Artist.

**1.2** The Artist confirms that the Release has been delivered in its final master form and is ready for commercial distribution.

## 2. Release Details

- **Title:** {{release_title}}
- **Type:** {{release_type}}
- **Territory:** {{territory}}
- **Effective Date:** {{effective_date}}

## 3. Grant of Rights

**3.1** The Artist hereby grants the Label the **{{exclusivity}}** right to reproduce, distribute, make available to the public, stream, broadcast, and otherwise exploit the Release in all formats and media now known or hereafter developed, within the Territory and for the Term defined herein.

**3.2** The rights granted under this Agreement are limited to the Release specified in Section 2 and do not extend to any other recordings by the Artist unless separately agreed in writing.

**3.3** The Artist retains all moral rights (Urheberpersoenlichkeitsrechte) in accordance with the Swiss Federal Act on Copyright and Related Rights (URG), Art. 16.

## 4. Term

**4.1** The term of this Agreement shall commence on **{{effective_date}}** and shall continue for **{{term}}** (the **"Term"**).

**4.2** Upon expiration of the Term, all exploitation rights granted hereunder shall revert to the Artist, subject to any licences validly granted to third parties during the Term which shall continue for their stated duration.

## 5. Remuneration

**5.1** The Label shall pay the Artist a royalty of **{{royalty_rate}}** of net receipts derived from the exploitation of the Release, calculated and paid quarterly.

**5.2** The Label shall pay the Artist a non-refundable advance of **{{advance}}** against future royalties, payable upon execution of this Agreement.

**5.3** Accounting statements shall be provided within sixty (60) days following the end of each accounting quarter.

**5.4** The Artist shall have the right to audit the Label's records pertaining to the Release once per calendar year upon thirty (30) days' written notice.

## 6. Release Obligations

**6.1** The Label shall release the Recording on major digital streaming platforms (including but not limited to Spotify, Apple Music, and YouTube Music) within **thirty (30) days** of the Effective Date.

**6.2** The Label shall use commercially reasonable efforts to promote the Release, including but not limited to playlist pitching, social media promotion, and press outreach.

**6.3** The Label shall provide the Artist with reasonable advance notice of the release date and shall consult the Artist on artwork, metadata, and promotional materials.

## 7. Artist Warranties

**7.1** The Artist warrants that:

- (a) The Artist is the sole creator and rights holder of the Release, or has obtained all necessary authorisations, licences, and clearances;
- (b) The Release does not infringe upon the intellectual property rights, privacy rights, or any other rights of any third party;
- (c) The Artist has the legal capacity and authority to enter into this Agreement and grant the rights contained herein.

**7.2** The Artist shall indemnify and hold harmless the Label against any claims, damages, or expenses arising from a breach of the warranties in Section 7.1.

## 8. Termination

**8.1** Either Party may terminate this Agreement for cause upon thirty (30) days' written notice if the other Party materially breaches this Agreement and fails to cure such breach within the notice period.

**8.2** The Label's failure to release the Recording within the timeframe specified in Section 6.1 shall constitute a material breach, entitling the Artist to terminate this Agreement immediately upon written notice.

**8.3** Upon termination, all rights granted hereunder shall revert to the Artist. The Label may continue to fulfil existing distribution commitments for a wind-down period of ninety (90) days.

**8.4** Termination shall not affect any accrued payment obligations or the Artist's right to receive royalties for exploitations that occurred during the Term.

## 9. Governing Law and Jurisdiction

**9.1** This Agreement shall be governed by and construed in accordance with {{governing_law}}.

**9.2** Any disputes arising out of or in connection with this Agreement shall be subject to the exclusive jurisdiction of the courts of **{{jurisdiction_canton}}, Switzerland**.

## 10. Signatures

By signing below, the Parties confirm that they have read and understood this Agreement in its entirety and agree to be bound by its terms.$$,
    'Zurich',
    'Swiss law (Obligationenrecht, SR 220)'
);
