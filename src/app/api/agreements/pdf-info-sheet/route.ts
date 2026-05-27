import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import React from 'react'
import { InfoSheetDocument } from '@/lib/pdf-info-sheet'
import type { ReactElement, JSXElementConstructor } from 'react'

export async function POST(request: NextRequest) {
  try {
    const { form, schedule } = await request.json()

    if (!form?.investor_name || !form?.principal_amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const data = {
      investor_name: form.investor_name,
      investor_pan: form.investor_pan ?? '',
      agreement_type: form.agreement_type || 'Investment Agreement',
      agreement_date: form.agreement_date ?? '',
      principal_amount: Number(form.principal_amount),
      roi_percentage: Number(form.roi_percentage),
      payout_frequency: form.payout_frequency,
      interest_type: form.interest_type,
      investment_start_date: form.investment_start_date,
      maturity_date: form.maturity_date,
      lock_in_years: Number(form.lock_in_years) || 0,
      schedule: schedule ?? [],
    }

    const element = React.createElement(InfoSheetDocument, { data }) as ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>
    const buffer = await renderToBuffer(element)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Investment-Info-${data.investor_name.replace(/\s+/g, '-')}.pdf"`,
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'PDF generation failed' },
      { status: 500 }
    )
  }
}
