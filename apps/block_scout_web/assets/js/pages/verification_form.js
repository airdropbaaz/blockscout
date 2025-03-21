import $ from 'jquery'
import omit from 'lodash/omit'
import URI from 'urijs'
import humps from 'humps'
import { subscribeChannel } from '../socket'
import { createStore, connectElements } from '../lib/redux_helpers.js'
import '../app'
import Dropzone from 'dropzone'

export const initialState = {
  channelDisconnected: false,
  addressHash: null,
  newForm: null
}

export function reducer (state = initialState, action) {
  switch (action.type) {
    case 'PAGE_LOAD':
    case 'ELEMENTS_LOAD': {
      return Object.assign({}, state, omit(action, 'type'))
    }
    case 'CHANNEL_DISCONNECTED': {
      if (state.beyondPageOne) return state

      return Object.assign({}, state, {
        channelDisconnected: true
      })
    }
    case 'RECEIVED_VERIFICATION_RESULT': {
      if (action.msg.verificationResult === 'ok') {
        return window.location.replace(window.location.href.split('/contract_verifications')[0].split('/verify')[0] + '/contracts')
      } else {
        return Object.assign({}, state, {
          newForm: action.msg.verificationResult
        })
      }
    }
    default:
      return state
  }
}

const elements = {
  '[data-selector="channel-disconnected-message"]': {
    render ($el, state) {
      if (state.channelDisconnected && !window.loading) $el.show()
    }
  },
  '[data-page="contract-verification"]': {
    render ($el, state) {
      if (state.newForm) {
        $el.replaceWith(state.newForm)
        $('button[data-button-loading="animation"]').click(_event => {
          $('#loading').removeClass('d-none')
        })

        $(function () {
          $('.js-btn-add-contract-libraries').on('click', function () {
            $('.js-smart-contract-libraries-wrapper').show()
            $(this).hide()
          })

          $('.js-smart-contract-form-reset').on('click', function () {
            $('.js-contract-library-form-group').removeClass('active')
            $('.js-contract-library-form-group').first().addClass('active')
            $('.js-smart-contract-libraries-wrapper').hide()
            $('.js-btn-add-contract-libraries').show()
            $('.js-add-contract-library-wrapper').show()
          })

          $('.js-btn-add-contract-library').on('click', function () {
            const nextContractLibrary = $('.js-contract-library-form-group.active').next('.js-contract-library-form-group')

            if (nextContractLibrary) {
              nextContractLibrary.addClass('active')
            }

            if ($('.js-contract-library-form-group.active').length === $('.js-contract-library-form-group').length) {
              $('.js-add-contract-library-wrapper').hide()
            }
          })
        })

        return $el
      }
      return $el
    }
  }
}

const $contractVerificationPage = $('[data-page="contract-verification"]')
const $contractVerificationChooseTypePage = $('[data-page="contract-verification-choose-type"]')

if ($contractVerificationPage.length) {
  window.onbeforeunload = () => {
    window.loading = true
  }

  const store = createStore(reducer)
  const addressHash = $('#smart_contract_address_hash').val()
  const { filter, blockNumber } = humps.camelizeKeys(URI(window.location).query(true))

  store.dispatch({
    type: 'PAGE_LOAD',
    addressHash,
    filter,
    beyondPageOne: !!blockNumber
  })
  connectElements({ store, elements })

  const addressChannel = subscribeChannel(`addresses:${addressHash}`)

  addressChannel.onError(() => store.dispatch({
    type: 'CHANNEL_DISCONNECTED'
  }))
  addressChannel.on('verification', (msg) => store.dispatch({
    type: 'RECEIVED_VERIFICATION_RESULT',
    msg: humps.camelizeKeys(msg)
  }))

  $('button[data-button-loading="animation"]').click(_event => {
    $('#loading').removeClass('d-none')
  })

  $(function () {
    function standardJSONBehavior () {
      $('#json-dropzone-form').removeClass('dz-clickable')
      this.on('addedfile', function (_file) {
        $('#verify-via-standart-json-input-submit').prop('disabled', false)
        $('#file-help-block').text('')
        $('#dropzone-previews').addClass('dz-started')
      })

      this.on('removedfile', function (_file) {
        if (this.files.length === 0) {
          $('#verify-via-standart-json-input-submit').prop('disabled', true)
          $('#dropzone-previews').removeClass('dz-started')
        }
      })
    }

    function metadataJSONBehavior () {
      this.on('addedfile', function (_file) {
        changeVisibilityOfVerifyButton(this.files.length)
        $('#file-help-block').text('')
      })

      this.on('removedfile', function (_file) {
        changeVisibilityOfVerifyButton(this.files.length)
      })
    }

    const $jsonDropzoneMetadata = $('#metadata-json-dropzone')
    const $jsonDropzoneStandardInput = $('#json-dropzone-form')

    if ($jsonDropzoneMetadata.length || $jsonDropzoneStandardInput.length) {
      const func = $jsonDropzoneMetadata.length ? metadataJSONBehavior : standardJSONBehavior
      const maxFiles = $jsonDropzoneMetadata.length ? 100 : 1
      const acceptedFiles = $jsonDropzoneMetadata.length ? 'text/plain,application/json,.sol,.json' : 'text/plain,application/json,.json'
      const tag = $jsonDropzoneMetadata.length ? '#metadata-json-dropzone' : '#json-dropzone-form'
      const previewsContainer = $jsonDropzoneMetadata.length ? undefined : '#dropzone-previews'

      var dropzone = new Dropzone(tag, {
        autoProcessQueue: false,
        acceptedFiles: acceptedFiles,
        parallelUploads: 100,
        uploadMultiple: true,
        addRemoveLinks: true,
        maxFilesize: 10,
        maxFiles: maxFiles,
        previewsContainer: previewsContainer,
        params: { address_hash: $('#smart_contract_address_hash').val() },
        init: func
      })
    }

    function changeVisibilityOfVerifyButton (filesLength) {
      if (filesLength > 0) {
        $('#verify-via-json-submit').prop('disabled', false)
      } else {
        $('#verify-via-json-submit').prop('disabled', true)
      }
    }

    setTimeout(function () {
      $('.nightly-builds-false').trigger('click')
    }, 10)

    $('.js-btn-add-contract-libraries').on('click', function () {
      $('.js-smart-contract-libraries-wrapper').show()
      $(this).hide()
    })

    $('.autodetectfalse').on('click', function () {
      if ($(this).prop('checked')) { $('.constructor-arguments').show() }
    })

    $('.autodetecttrue').on('click', function () {
      if ($(this).prop('checked')) { $('.constructor-arguments').hide() }
    })

    $('.optimization-false').on('click', function () {
      if ($(this).prop('checked')) { $('.optimization-runs').hide() }
    })

    $('.optimization-true').on('click', function () {
      if ($(this).prop('checked')) { $('.optimization-runs').show() }
    })

    $('.js-smart-contract-form-reset').on('click', function () {
      $('.js-contract-library-form-group').removeClass('active')
      $('.js-contract-library-form-group').first().addClass('active')
      $('.js-smart-contract-libraries-wrapper').hide()
      $('.js-btn-add-contract-libraries').show()
      $('.js-add-contract-library-wrapper').show()
    })

    $('.js-btn-add-contract-library').on('click', function () {
      const nextContractLibrary = $('.js-contract-library-form-group.active').next('.js-contract-library-form-group')

      if (nextContractLibrary) {
        nextContractLibrary.addClass('active')
      }

      if ($('.js-contract-library-form-group.active').length === $('.js-contract-library-form-group').length) {
        $('.js-add-contract-library-wrapper').hide()
      }
    })

    $('#verify-via-standart-json-input-submit').on('click', (event) => {
      event.preventDefault()
      if (dropzone.files.length > 0) {
        dropzone.processQueue()
      } else {
        $('#loading').addClass('d-none')
      }
    })

    $('#verify-via-json-submit').on('click', function () {
      if (dropzone.files.length > 0) {
        dropzone.processQueue()
      } else {
        $('#loading').addClass('d-none')
      }
    })
  })
} else if ($contractVerificationChooseTypePage.length) {
  $('.verify-via-flattened-code').on('click', function () {
    if ($(this).prop('checked')) {
      $('#verify_via_flattened_code_button').show()
      $('#verify_via_sourcify_button').hide()
      $('#verify_vyper_contract_button').hide()
      $('#verify_via_standard_json_input').hide()
    }
  })

  $('.verify-via-sourcify').on('click', function () {
    if ($(this).prop('checked')) {
      $('#verify_via_flattened_code_button').hide()
      $('#verify_via_sourcify_button').show()
      $('#verify_vyper_contract_button').hide()
      $('#verify_via_standard_json_input').hide()
    }
  })

  $('.verify-vyper-contract').on('click', function () {
    if ($(this).prop('checked')) {
      $('#verify_via_flattened_code_button').hide()
      $('#verify_via_sourcify_button').hide()
      $('#verify_vyper_contract_button').show()
      $('#verify_via_standard_json_input').hide()
    }
  })

  $('.verify-via-standard-json-input').on('click', function () {
    if ($(this).prop('checked')) {
      $('#verify_via_flattened_code_button').hide()
      $('#verify_via_sourcify_button').hide()
      $('#verify_vyper_contract_button').hide()
      $('#verify_via_standard_json_input').show()
    }
  })
}
